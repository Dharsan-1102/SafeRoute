/**
 * Safety Routes — /api/safety/*
 */

const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');

const ZONES_FILE   = path.join(__dirname, '../data/dangerZones.json');
const REPORTS_FILE = path.join(__dirname, '../data/reports.json');

// Helper: read JSON file safely
function readJSON(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

// Helper: write JSON file safely
function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

// Helper: Haversine distance (km)
function distance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── GET /danger-zones ──────────────────────────────────────
router.get('/danger-zones', (req, res) => {
  const data = readJSON(ZONES_FILE, { zones: [], safeSpots: [] });
  res.json(data);
});

// ─── POST /score ─────────────────────────────────────────────
router.post('/score', (req, res) => {
  const { startLat, startLng, destLat, destLng, timeOfDay, routeType } = req.body;

  if (!startLat || !destLat) {
    return res.status(400).json({ error: 'Start and destination coordinates required' });
  }

  const hour    = timeOfDay !== undefined ? parseInt(timeOfDay) : new Date().getHours();
  const isNight = hour < 6 || hour > 19;

  // Load zones
  const { zones = [] } = readJSON(ZONES_FILE, { zones: [] });

  // Load user reports
  const { reports = [] } = readJSON(REPORTS_FILE, { reports: [] });

  // Midpoint of route
  const midLat = (startLat + destLat) / 2;
  const midLng = (startLng + destLng) / 2;

  // Score deduction from danger zones
  let dangerDeduction = 0;
  let dangerZoneCount = 0;
  zones.forEach(zone => {
    const d = distance(midLat, midLng, zone.lat, zone.lng);
    if (d < zone.radius / 1000) {
      dangerDeduction += zone.level === 'high' ? 25 : 12;
      dangerZoneCount++;
    }
  });

  // Score deduction from recent reports
  let reportDeduction = 0;
  const recentReports = reports.filter(r => Date.now() - r.ts < 24 * 60 * 60 * 1000);
  recentReports.forEach(r => {
    const d = distance(midLat, midLng, r.lat, r.lng);
    if (d < 1) reportDeduction += r.severity * 5;
  });

  // Base score
  let score = 75;

  // Simulated factors (replace with real data in production)
  const policeCount   = Math.floor(Math.random() * 4) + 2;
  const hospitalCount = Math.floor(Math.random() * 3) + 1;
  const crowdCount    = Math.floor(Math.random() * 4) + 2;

  score += Math.min(policeCount   * 7,  20);
  score += Math.min(hospitalCount * 5,  12);
  score += Math.min(crowdCount    * 3,   9);
  score -= dangerDeduction;
  score -= Math.min(reportDeduction, 20);

  const nightPenalty = isNight ? 15 : 0;
  score -= nightPenalty;

  // Route type modifier
  if (routeType === 'safest')   score += 10;
  else if (routeType === 'fastest') score -= 5;

  score = Math.min(100, Math.max(0, Math.round(score)));

  // Label / color / recommendation
  let label, color, recommendation;
  if (score >= 75) {
    label = '🟢 SAFE Route';
    color = '#1fa362';
    recommendation = 'Route is safe. Stay aware of your surroundings.';
  } else if (score >= 50) {
    label = '🟡 MODERATE Caution';
    color = '#d97706';
    recommendation = 'Stay alert. Share your live location before travelling.';
  } else {
    label = '🔴 HIGH RISK — Avoid if possible';
    color = '#dc2626';
    recommendation = 'Consider alternate route or travel with a companion.';
  }

  // Alerts
  const alerts = [];
  if (dangerDeduction > 25) alerts.push({ type: 'danger',  message: '⚠️ Route passes through a high-risk zone!' });
  if (isNight)               alerts.push({ type: 'warning', message: '🌙 Night travel detected — stay in lit areas.' });
  if (policeCount < 2)       alerts.push({ type: 'warning', message: '🚔 Limited police presence on this route.' });
  if (recentReports.length > 0) alerts.push({ type: 'warning', message: `📢 ${recentReports.length} recent incident(s) reported nearby.` });

  res.json({
    score,
    label,
    color,
    recommendation,
    factors: { policeCount, hospitalCount, crowdCount, dangerZones: dangerZoneCount, nightPenalty, isNight },
    alerts
  });
});

// ─── POST /safe-spots ────────────────────────────────────────
router.post('/safe-spots', (req, res) => {
  const { lat, lng, radius = 5 } = req.body;

  const allSpots = [
    { lat: 13.0500, lng: 80.2824, type: 'police',   name: 'Marina Police Station',   distance: 0.5 },
    { lat: 13.0358, lng: 80.2448, type: 'hospital',  name: 'Apollo Hospital',          distance: 1.2 },
    { lat: 13.0452, lng: 80.2427, type: 'crowd',     name: 'T Nagar Shopping Complex', distance: 0.8 },
    { lat: 13.0600, lng: 80.2600, type: 'police',    name: 'Egmore Police Post',       distance: 1.5 },
    { lat: 13.0750, lng: 80.2750, type: 'hospital',  name: 'Government General Hospital', distance: 2.1 },
    { lat: 13.0300, lng: 80.2300, type: 'crowd',     name: 'Express Avenue Mall',      distance: 1.8 }
  ];

  const nearby = lat && lng
    ? allSpots.filter(s => distance(lat, lng, s.lat, s.lng) < radius)
    : allSpots;

  res.json(nearby);
});

// ─── POST /report ─────────────────────────────────────────────
router.post('/report', (req, res) => {
  const { lat, lng, type, description, severity = 1 } = req.body;

  if (!lat || !lng) return res.status(400).json({ error: 'Coordinates required' });

  const existing = readJSON(REPORTS_FILE, { reports: [] });
  existing.reports.push({
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    type,
    description,
    severity: parseInt(severity),
    ts: Date.now(),
    createdAt: new Date().toISOString()
  });

  writeJSON(REPORTS_FILE, existing);

  console.log(`[REPORT] Type:${type} at ${lat},${lng} — "${description}"`);
  res.json({ success: true, message: 'Report submitted. Thank you for helping others stay safe!' });
});

// ─── POST /track ──────────────────────────────────────────────
router.post('/track', (req, res) => {
  // In production: store in DB and push via WebSocket to contacts
  const { lat, lng, ts } = req.body;
  console.log(`[TRACK] ${lat}, ${lng} @ ${new Date(ts).toLocaleTimeString()}`);
  res.json({ success: true });
});

// ─── GET /reports ──────────────────────────────────────────────
router.get('/reports', (req, res) => {
  const data = readJSON(REPORTS_FILE, { reports: [] });
  const recent = data.reports
    .filter(r => Date.now() - r.ts < 24 * 60 * 60 * 1000)
    .slice(-50)
    .reverse();
  res.json(recent);
});

module.exports = router;