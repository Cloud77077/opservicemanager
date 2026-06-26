// ── OTP Manager — VPS Proxy Server ──────────────────────────────────────────
// Proxies /api/* → https://admin.otpservice.xyz
// Solves CORS entirely. Run with: node server.js
//
// Requirements: node >= 14
// Install deps: npm install express http-proxy-middleware

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// 1. Serve static files (index.html, style.css, app.js)
app.use(express.static(path.join(__dirname)));

// 2. Proxy /api/* → https://admin.otpservice.xyz
app.use('/api', createProxyMiddleware({
  target:       'https://admin.otpservice.xyz',
  changeOrigin: true,
  pathRewrite:  { '^/api': '' },   // /api/stubs/... → /stubs/...
  on: {
    error: (err, req, res) => {
      console.error('[proxy error]', err.message);
      res.status(502).json({ success: false, message: 'Proxy error: ' + err.message });
    }
  }
}));

app.listen(PORT, () => {
  console.log(`OTP Manager running → http://localhost:${PORT}`);
});
