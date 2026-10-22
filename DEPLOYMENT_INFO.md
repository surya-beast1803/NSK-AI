# NSK AI Production Deployment Guide

## Production Target
- **Target URL:** `https://nskai.quexitechnologies.com`

---

## 1. Git Repositories & Remotes

### Primary / Development Repository (`origin`):
- **Repository:** `https://github.com/surya-beast1803/NSK-AI.git`
- **Rule:** Automatic/standard updates go here (`git push origin main`).

### Client Production Repository (`client`):
- **Repository:** `https://github.com/Walter-jessie/NSK-AI.git`
- **Username:** `Walter-jessie`
- **Email:** `walterwhite.jessiepink@gmail.com`
- **Password / Auth:** `Saul@explorer18`
- **Rule:** **STRICTLY ON-DEMAND.** Only push to this remote (`git push client main`) when explicitly requested by user.

---

## 2. Production Environment Variables (`.env`)
*(Create a `.env` file on the production server with the following values)*

```env
CONVAI_API_KEY=5c531901c599a3968a0dc51cf9c1785c
CONVAI_CHARACTER_ID=7950d6d7-6376-4169-b618-06dc442325a5
PORT=8080
```

---

## 3. Server Setup & Build Commands
```bash
# 1. Install dependencies
npm install

# 2. Build production assets
npm run build

# 3. Start production server
npm start
# OR using PM2 process manager:
pm2 start server/index.js --name "nsk-ai"
```

---

## 4. Reverse Proxy & SSL Requirements
- Nginx / Cloudflare must proxy incoming requests on `https://nskai.quexitechnologies.com` to `http://localhost:8080`.
- **SSL (HTTPS) is mandatory** for browser microphone and Web Audio APIs.
