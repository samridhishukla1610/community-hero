# 🏙️ CivicLens — Community Hero

An AI-powered hyperlocal issue reporting platform built for **Vibe2Ship Hackathon** (Coding Ninjas × Google for Developers).

## ✨ Features
- 📸 Photo-based issue reporting
- 🤖 Gemini AI auto-categorization & severity detection
- 🗺️ Live issue map (Google Maps ready)
- 📊 Impact dashboard with status tracking
- 📍 GPS-based location detection
- 💾 Local storage persistence

## 🚀 Setup in 3 Steps

### Step 1 — Get Your Gemini API Key
1. Go to https://aistudio.google.com/apikey
2. Click "Create API Key"
3. Copy the key (starts with `AIza...`)

### Step 2 — Add Your API Key
Open `js/app.js` and paste your key on line 3:
```js
let GEMINI_API_KEY = 'YOUR_KEY_HERE';
```
OR just enter it in the popup when you open the app.

### Step 3 — Deploy on Vercel (Free)
1. Push this folder to GitHub
2. Go to https://vercel.com
3. Click "New Project" → Import your repo
4. Click Deploy — done!

## 📁 File Structure
```
community-hero/
├── index.html        ← Main app
├── css/
│   └── style.css     ← All styles
├── js/
│   └── app.js        ← Logic + Gemini AI
└── README.md
```

## 🧠 Technologies Used
- **Gemini 1.5 Flash** — Image analysis & issue categorization
- **Google AI Studio** — API & deployment platform
- **Google Maps JS API** — (add your Maps key to enable)
- **Vanilla JS + HTML/CSS** — No framework needed

## 📝 Google Doc Template (for submission)
**Problem Statement:** Community Hero — Hyperlocal Problem Solver

**Solution Overview:**
CivicLens is an AI-powered civic platform that enables citizens to photograph, report, and track community infrastructure issues. Gemini Vision AI automatically categorizes issues, assesses severity, and suggests corrective actions — reducing the friction of civic reporting.

**Key Features:**
- AI-powered photo analysis using Gemini Vision
- Real-time issue tracking with status updates
- Impact dashboard for transparency
- GPS-based geolocation
- Community-driven verification system

**Technologies Used:**
- Gemini 1.5 Flash (Google AI Studio)
- Google Maps JavaScript API
- Google Cloud Platform
- HTML/CSS/JavaScript

**Google Technologies Utilized:**
- Gemini API (primary AI engine)
- Google AI Studio (deployment)
- Google Maps API (geolocation & mapping)
