# UniGrade — University CGPA App

A full-stack web app that securely fetches your university portal grades and auto-calculates your CGPA.

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
cd server
npm install
```

### 2. Run in **Demo Mode** (no real portal needed)
```bash
npm start
```
Then open: **http://localhost:3000**

> Demo mode uses sample data. Set `USE_MOCK=false` in `.env` when ready for your real portal.

---

## 🔧 Customising for Your University Portal

Open `server/scraper.js` and update the `CONFIG` object at the top:

| Constant | What to change |
|---|---|
| `PORTAL_LOGIN_URL` | Full URL of your login page |
| `PORTAL_RESULTS_URL` | Full URL of your results/transcript page |
| `USERNAME_SELECTOR` | CSS selector for username input (e.g. `#studentId`) |
| `PASSWORD_SELECTOR` | CSS selector for password input (e.g. `#password`) |
| `SUBMIT_BUTTON_SELECTOR` | CSS selector for submit button (e.g. `button[type=submit]`) |
| `POST_LOGIN_INDICATOR` | Selector that appears **only after** successful login |
| `LOGIN_ERROR_SELECTOR` | Selector for login error message |
| `SEMESTER_BLOCK_SELECTOR` | Selector wrapping each semester block |
| `SEMESTER_TITLE_SELECTOR` | Selector for semester name inside each block |
| `COURSE_ROW_SELECTOR` | Selector for each course row |
| `COURSE_CODE_SELECTOR` | Course code cell |
| `COURSE_NAME_SELECTOR` | Course name cell |
| `COURSE_CREDITS_SELECTOR` | Credit hours cell |
| `COURSE_GRADE_SELECTOR` | Grade earned cell |

### Finding Selectors
1. Open your university portal in Chrome
2. Right-click the username field → **Inspect**
3. Copy the `id` or `class` → update the selector

---

## 🔒 Security Design

- ✅ Credentials are **never written to disk or database**
- ✅ Puppeteer session is **destroyed immediately** after scraping
- ✅ Credentials are **overwritten in memory** after use
- ✅ `helmet` adds HTTP security headers (X-Frame-Options, CSP, etc.)
- ✅ Body size limited to **10KB** to prevent abuse
- ✅ CAPTCHA detection with user-friendly error message

---

## 📁 Project Structure

```
CGPA/
├── server/
│   ├── index.js       # Express server + POST /api/fetch-grades
│   ├── scraper.js     # Puppeteer engine (update selectors here)
│   ├── .env           # USE_MOCK, PORT, NODE_ENV
│   └── package.json
└── client/
    ├── index.html     # Full UI (login + dashboard)
    ├── app.js         # Frontend logic + CGPA calculator
    └── style.css      # Glassmorphism + animations
```

---

## ⚙️ Environment Variables (`server/.env`)

| Variable | Default | Description |
|---|---|---|
| `USE_MOCK` | `true` | Use sample data (set `false` for real portal) |
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment |

---

## 🧮 Grade Scale

The default grade scale (4.0 system) is in `client/app.js` under `DEFAULT_GRADE_SCALE`.
You can also **edit it live** in the dashboard UI without restarting the server.

---

## 📦 Free Deployment Setup

This project is now prepared for free Docker-based deployment on services like **Render.com** or **Fly.io**.

### What was added
- `Dockerfile` — builds the app with Puppeteer and Chromium dependencies
- `.dockerignore` — keeps the image clean
- `.gitignore` — ignores secrets and local artifacts
- `render.yaml` — Render service definition for automatic deployment
- `server/.env.example` — environment variable template

### Run locally with Docker
```bash
# build from the repo root
docker build -t uniggrade-app .

# run locally
docker run -p 3000:3000 --env USE_MOCK=false --env PORT=3000 unigrade-app
```

### Deploy on Render (free tier)
1. Push the repo to GitHub.
2. Create a free Render account.
3. Connect your GitHub repository.
4. Choose **Docker** and use the root `Dockerfile`.
5. Set environment variables in Render:
   - `NODE_ENV=production`
   - `USE_MOCK=false`
   - `PORT=3000`
6. Deploy.

### Notes
- The app is configured to use **in-memory credentials only** and will not persist login data.
- For real CUET scraping, make sure `USE_MOCK=false` and your portal credentials are entered on the login page.
- If you want, I can also add a `render.toml` or Railway config next.
