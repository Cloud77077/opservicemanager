'use strict';

const BASE = '/api/stubs/handler_api.php';

let API_KEY   = '';
let numbers   = [];
let rowCount  = 0;
let autoTimer = null;
let multiActive = false;
let multiFrames = [];

const apiGate        = document.getElementById('apiGate');
const appWrap        = document.getElementById('appWrap');
const gateKey        = document.getElementById('gateKey');
const gateVerify     = document.getElementById('gateVerify');
const gateStatus     = document.getElementById('gateStatus');
const buyOnceBtn     = document.getElementById('buyOnce');
const autoToggle     = document.getElementById('autoToggle');
const multiToggle    = document.getElementById('multiToggle');
const autoLabel      = document.getElementById('autoLabel');
const multiLabel     = document.getElementById('multiLabel');
const autoStatusBadge= document.getElementById('autoStatusBadge');
const autoSpeedInline= document.getElementById('autoSpeedInline');
const autoInterval   = document.getElementById('autoInterval');
const autoIntervalVal= document.getElementById('autoIntervalVal');
const buyStatus      = document.getElementById('buyStatus');
const numbersBody    = document.getElementById('numbersBody');
const emptyRow       = document.getElementById('emptyRow');
const countBadge     = document.getElementById('countBadge');
const clearAllBtn    = document.getElementById('clearAll');
const clearLogBtn    = document.getElementById('clearLog');
const logBox         = document.getElementById('logBox');
const balanceDisplay = document.getElementById('balanceDisplay');
const changeKey      = document.getElementById('changeKey');
const toast          = document.getElementById('toast');

function showToast(msg, dur = 2800) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), dur);
}

function log(msg, type = 'info') {
  const now = new Date().toLocaleTimeString('en-IN', { hour12: false });
  const el  = document.createElement('div');
  el.className = 'log-entry';
  el.innerHTML = `<span class="log-time">${now}</span><span class="log-msg log-${type}">${msg}</span>`;
  logBox.appendChild(el);
  logBox.scrollTop = logBox.scrollHeight;
  while (logBox.children.length > 400) logBox.removeChild(logBox.firstChild);
}

function setStatus(msg) { buyStatus.textContent = msg; }
function gateMsg(msg, type) {
  gateStatus.textContent = msg;
  gateStatus.className = 'gate-status ' + (type || '');
}

async function apiFetch(params) {
  const url = new URL(BASE, location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text }; }
}

// ── KEY GATE ──────────────────────────────────────────────────────────────────
// Just validate key format locally — no API call, no number purchase
function verifyKey(key) {
  if (key.length < 20) {
    gateMsg('✗ Key too short. Check and try again.', 'err');
    return;
  }
  gateMsg('✓ Key accepted! Loading…', 'ok');
  API_KEY = key;
  localStorage.setItem('otpm_key', key);
  log('API key set.', 'ok');
  setTimeout(() => {
    apiGate.style.display = 'none';
    appWrap.style.display = '';
  }, 600);
}

gateVerify.addEventListener('click', () => {
  const k = gateKey.value.trim();
  if (!k) { gateMsg('Please enter your API key.', 'err'); return; }
  verifyKey(k);
});
gateKey.addEventListener('keydown', e => { if (e.key === 'Enter') gateVerify.click(); });

changeKey.addEventListener('click', () => {
  localStorage.removeItem('otpm_key');
  API_KEY = '';
  apiGate.style.display = '';
  appWrap.style.display = 'none';
  gateKey.value = '';
  gateMsg('');
});

// ── BUY NUMBER ────────────────────────────────────────────────────────────────
async function buyNumber() {
  if (!API_KEY) return;
  setStatus('Buying number…');
  try {
    const data = await apiFetch({
      action: 'getNumber', api_key: API_KEY,
      service: 'jio', server: 3, operator: 0
    });

    if (!data.success) {
      const msg = data.message || data._raw || JSON.stringify(data);
      log('Buy failed: ' + msg, 'err');
      setStatus('Failed: ' + msg);
      return null;
    }

    const num = {
      id: ++rowCount,
      txnId: data.data.transactionId,
      phone: data.data.phoneNumber,
      otp: null, status: 'active'
    };
    numbers.push(num);
    addRow(num);
    setStatus(`✓ ${num.phone}  (txn: ${num.txnId})`);
    log(`✓ Bought: ${num.phone} | txn: ${num.txnId}`, 'ok');
    if (data.data.updatedBalance !== undefined) {
      balanceDisplay.textContent = `₹${parseFloat(data.data.updatedBalance).toFixed(2)}`;
    }
    pollOtp(num);
    return num;
  } catch (e) {
    log('Error: ' + e.message, 'err');
    setStatus('Error: ' + e.message);
    return null;
  }
}

// ── GET OTP ───────────────────────────────────────────────────────────────────
async function getOtp(num) {
  try {
    const data = await apiFetch({
      action: 'getOtp', api_key: API_KEY,
      transactionId: num.txnId
    });
    if (data.success && data.otp) {
      num.otp = data.otp;
      num.status = 'received';
      updateRow(num);
      log(`✓ OTP for ${num.phone}: ${data.otp}`, 'ok');
      showToast(`OTP: ${data.otp}  (${num.phone})`);
      return true;
    }
    return false;
  } catch { return false; }
}

// ── CANCEL ────────────────────────────────────────────────────────────────────
async function cancelNumber(num) {
  try {
    const data = await apiFetch({
      action: 'cancelNumber', api_key: API_KEY,
      transactionId: num.txnId
    });
    if (data.success) {
      log(`Cancelled: ${num.phone} (txn: ${num.txnId})`, 'info');
      removeRow(num);
      numbers = numbers.filter(n => n.txnId !== num.txnId);
      updateCount();
    } else {
      showToast('Cancel failed');
      log('Cancel failed: ' + (data.message || data._raw || JSON.stringify(data)), 'err');
    }
  } catch (e) { log('Cancel error: ' + e.message, 'err'); }
}

// ── OTP POLLING ───────────────────────────────────────────────────────────────
function pollOtp(num) {
  let attempts = 0;
  const iv = setInterval(async () => {
    if (num.status !== 'active') { clearInterval(iv); return; }
    attempts++;
    const got = await getOtp(num);
    if (got || attempts >= 20) {
      clearInterval(iv);
      if (!got && num.status === 'active') {
        num.status = 'expired';
        updateRow(num);
        log(`OTP timeout: ${num.phone}`, 'err');
      }
    }
  }, 3000);
}

// ── TABLE ─────────────────────────────────────────────────────────────────────
function addRow(num) {
  emptyRow.style.display = 'none';
  const tr = document.createElement('tr');
  tr.className = 'number-row';
  tr.id = `row-${num.txnId}`;
  tr.innerHTML = rowHTML(num);
  numbersBody.appendChild(tr);
  bindRow(tr, num);
  updateCount();
}

function updateRow(num) {
  const tr = document.getElementById(`row-${num.txnId}`);
  if (!tr) return;
  tr.innerHTML = rowHTML(num);
  bindRow(tr, num);
}

function removeRow(num) {
  document.getElementById(`row-${num.txnId}`)?.remove();
  if (!numbers.filter(n => n.status !== 'cancelled').length) {
    emptyRow.style.display = '';
  }
}

const STATUS_CLS   = { active:'s-active', received:'s-received', waiting:'s-waiting', expired:'s-expired' };
const STATUS_LABEL = { active:'Active', received:'Received', waiting:'Waiting', expired:'Expired' };

function rowHTML(num) {
  const sc = STATUS_CLS[num.status] || 's-waiting';
  const sl = STATUS_LABEL[num.status] || num.status;
  const otpHTML = num.otp
    ? `<span class="otp-value">${num.otp}</span>`
    : `<span class="otp-waiting">Waiting…</span>`;
  let actHTML = '';
  if (num.status === 'active') {
    actHTML = `<button class="btn btn-success a-getotp">Get OTP</button>
               <button class="btn btn-danger a-cancel">Cancel</button>`;
  } else if (num.status === 'received' && num.otp) {
    actHTML = `<button class="btn btn-ghost btn-sm a-copy">Copy OTP</button>`;
  }
  return `
    <td class="row-index">${num.id}</td>
    <td><span class="phone-num">${num.phone}</span></td>
    <td><span class="txn-id">${num.txnId}</span></td>
    <td>${otpHTML}</td>
    <td><span class="status-pill ${sc}">${sl}</span></td>
    <td class="actions-cell">${actHTML}</td>`;
}

function bindRow(tr, num) {
  tr.querySelector('.a-cancel')?.addEventListener('click', () => cancelNumber(num));
  tr.querySelector('.a-getotp')?.addEventListener('click', async () => {
    log(`Manual OTP fetch: ${num.phone}`, 'info');
    await getOtp(num);
  });
  tr.querySelector('.a-copy')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(num.otp);
    showToast(`Copied: ${num.otp}`);
  });
}

function updateCount() {
  countBadge.textContent = `${numbers.length} active`;
}

// ── AUTO CLICK ────────────────────────────────────────────────────────────────
function startAuto() {
  const ms = parseInt(autoInterval.value) || 1000;
  autoTimer = setInterval(buyNumber, ms);
  autoLabel.textContent = 'On';
  autoStatusBadge.textContent = 'Auto: ON';
  autoStatusBadge.className = 'badge on-auto';
  autoSpeedInline.style.display = 'flex';
  log(`Auto click ON (${ms}ms)`, 'info');
}
function stopAuto() {
  clearInterval(autoTimer); autoTimer = null;
  autoLabel.textContent = 'Off';
  autoStatusBadge.textContent = 'Auto: OFF';
  autoStatusBadge.className = 'badge';
  autoSpeedInline.style.display = 'none';
  log('Auto click OFF', 'info');
}
autoToggle.addEventListener('change', () => {
  if (autoToggle.checked) { if (multiToggle.checked) { multiToggle.checked = false; stopMulti(); } startAuto(); }
  else stopAuto();
});
autoInterval.addEventListener('input', () => {
  autoIntervalVal.textContent = `${autoInterval.value}ms`;
  if (autoTimer) { stopAuto(); startAuto(); }
});

// ── MULTI CLICK ───────────────────────────────────────────────────────────────
const MULTI_MS = Math.round(1000 / 15);

function startMulti() {
  multiActive = true;
  multiLabel.textContent = 'On';
  autoStatusBadge.textContent = 'Multi: ON';
  autoStatusBadge.className = 'badge on-multi';
  log('Multi click ON (15/sec)', 'info');
  (function tick() {
    if (!multiActive) return;
    buyNumber();
    multiFrames.push(setTimeout(tick, MULTI_MS));
  })();
}
function stopMulti() {
  multiActive = false;
  multiFrames.forEach(clearTimeout); multiFrames = [];
  multiLabel.textContent = 'Off';
  autoStatusBadge.textContent = 'Auto: OFF';
  autoStatusBadge.className = 'badge';
  log('Multi click OFF', 'info');
}
multiToggle.addEventListener('change', () => {
  if (multiToggle.checked) { if (autoToggle.checked) { autoToggle.checked = false; stopAuto(); } startMulti(); }
  else stopMulti();
});

// ── BUY ONCE ──────────────────────────────────────────────────────────────────
buyOnceBtn.addEventListener('click', buyNumber);

// ── CLEAR ─────────────────────────────────────────────────────────────────────
clearAllBtn.addEventListener('click', () => {
  numbers = []; rowCount = 0;
  numbersBody.innerHTML = '';
  numbersBody.appendChild(emptyRow);
  emptyRow.style.display = '';
  updateCount();
  log('Cleared all numbers', 'info');
});
clearLogBtn.addEventListener('click', () => { logBox.innerHTML = ''; });

// ── INIT ──────────────────────────────────────────────────────────────────────
const savedKey = localStorage.getItem('otpm_key');
if (savedKey) {
  gateKey.value = savedKey;
  verifyKey(savedKey);
} else {
  log('Enter API key to start.', 'info');
}
