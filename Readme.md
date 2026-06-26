# OTP Manager

Web UI for otpservice.xyz — buy Jio numbers, auto-fetch OTPs, cancel activations.

## Files

```
otp-manager/
├── index.html     ← UI
├── style.css      ← styles
├── app.js         ← frontend logic
├── server.js      ← Node.js proxy (CORS fix + static server)
├── package.json
└── README.md
```

---

## VPS Deploy (Ubuntu / Debian)

### 1. Install Node.js (if not installed)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. Upload files to VPS
```bash
# from your local machine
scp -r otp-manager/ user@YOUR_VPS_IP:/home/user/otp-manager
```

Or clone from GitHub:
```bash
git clone https://github.com/YOURUSER/otp-manager.git
cd otp-manager
```

### 3. Install dependencies
```bash
cd otp-manager
npm install
```

### 4. Run with PM2 (keeps it alive after logout)
```bash
# install pm2 once
sudo npm install -g pm2

# start app
pm2 start server.js --name otp-manager

# auto-restart on reboot
pm2 save
pm2 startup
```

### 5. Nginx reverse proxy (so it runs on port 80 / domain)
```bash
sudo apt install nginx -y
sudo nano /etc/nginx/sites-available/otp-manager
```

Paste this (replace YOUR_DOMAIN or use your VPS IP):
```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/otp-manager /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. HTTPS (optional, free with Certbot)
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d YOUR_DOMAIN
```

---

## CORS — Does it block on VPS?

**No.** The browser calls `/api/...` on your own VPS.  
`server.js` forwards that to `admin.otpservice.xyz` server-side.  
Since the proxy runs on the server, there is no cross-origin request from the browser — CORS is completely bypassed.

---

## Local dev
```bash
npm install
npm start
# open http://localhost:3000
```
