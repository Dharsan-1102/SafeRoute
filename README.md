# 🛡️ SafeRoute — AI-Powered Women Safety Navigator

A full-stack women safety route finder with 3D color maps, real-time tracking, SOS alerts, voice navigation, and crowdsourced incident reporting.

---

## ✨ Features Implemented

| Feature | Description |
|---|---|
| 🗺️ **3D Color Map** | MapLibre-GL with full color tiles, pitch/bearing for 3D view |
| 🌙 **Dark / Light Toggle** | Switch between day and night map styles |
| 🔥 **Incident Heatmap** | Color-gradient overlay from crowdsourced reports |
| 🛡️ **Safe Zone Rings** | Animated radius rings around police/hospital coverage |
| 🔍 **Google-style Autocomplete** | Real-time suggestions via Photon API (free, no key needed) |
| 🔀 **Route Alternatives** | 3 route options (Safest / Balanced / Fastest) with safety scores |
| 🎙️ **Voice Navigation** | Turn-by-turn spoken directions via Web Speech API |
| ⏱️ **Live ETA Countdown** | Ticking countdown updated in real time |
| 👥 **Trusted Contacts** | Save contacts, send WhatsApp/SMS with one tap |
| ✅ **Safe Arrival Check-in** | Auto-alert contacts if check-in missed |
| 📞 **Fake Call** | Trigger a realistic incoming call to escape situations |
| 📢 **Crowdsource Reports** | Submit & view live incident reports with heatmap update |
| 🚨 **SOS Emergency** | One-tap SOS to all trusted contacts with GPS link |
| 📡 **Live Tracking** | Share real-time location via WebSocket |
| 🏥 **Safe Spots Nearby** | Shows police stations, hospitals, crowded areas on map |

---

## 📁 Project Structure

```
saferoute/
├── frontend/
│   ├── index.html        ← Main UI (all features)
│   ├── style.css         ← Complete styles (dark/light, responsive)
│   └── script.js         ← All frontend logic
│
└── backend/
    ├── server.js         ← Express + Socket.IO server
    ├── package.json
    ├── .env.example      ← Copy to .env
    ├── routes/
    │   ├── safety.js     ← Safety score, danger zones, reports, tracking
    │   ├── routes.js     ← Route optimization, autocomplete, traffic
    │   └── contacts.js   ← Trusted contacts CRUD
    └── data/
        ├── dangerZones.json   ← Danger zone definitions
        ├── reports.json       ← User-submitted incident reports
        └── contacts.json      ← Saved trusted contacts
```

---

## 🚀 Setup & Run

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env if needed (defaults work out of the box)
```

### 3. Start the server

```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start
```

### 4. Open in browser

```
http://localhost:3000
```

---

## 🗺️ Map Notes

The app uses **MapLibre-GL** (open source, free) with:
- **Free mode**: OpenStreetMap raster tiles (color, no API key needed)
- **3D mode**: Tilts the map to 50° pitch with bearing — press the 3D button
- **Premium 3D buildings**: Get a free [MapTiler key](https://cloud.maptiler.com) and add it to `.env` as `MAPTILER_KEY` — then in `script.js` replace the tile URLs

---

## 📱 Responsive

- Works on mobile and desktop
- Sidebar collapses on mobile with a floating toggle button
- Touch-friendly buttons and map controls

---

## 🔧 Customize

### Add real danger zones
Edit `backend/data/dangerZones.json` — add your own lat/lng zones

### Add real SMS (SOS)
Uncomment and configure Twilio in `.env`, then add the Twilio SDK to `server.js`

### Add MapTiler 3D vector tiles (best quality)
1. Get free key at https://cloud.maptiler.com
2. Set `MAPTILER_KEY` in `.env`
3. In `script.js`, the `buildFreeStyle()` function already has the MapTiler URL — just swap the key

---

## 🆘 Emergency Numbers (India)

- **112** — All emergencies
- **100** — Police
- **108** — Ambulance
- **1091** — Women Helpline
- **181** — Women Helpline (alternate)