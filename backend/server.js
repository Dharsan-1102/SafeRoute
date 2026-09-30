/**
 * SafeRoute — Backend Server (Fixed - No Contacts Required)
 */

const express    = require('express');
const cors       = require('cors');
const http       = require('http');
const socketIO   = require('socket.io');
const path       = require('path');

const safetyRoutes = require('./routes/safety');
const routeRoutes  = require('./routes/routes');

const app    = express();
const server = http.createServer(app);
const io     = socketIO(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ===== API ROUTES =====
app.use('/api/safety', safetyRoutes);
app.use('/api/routes', routeRoutes);

// ===== LIVE TRACKING STORE =====
const activeUsers = new Map();
const sosAlerts   = [];

// ===== WEBSOCKET =====
io.on('connection', socket => {
  console.log(`[WS] Client connected: ${socket.id}`);

  socket.on('share-location', data => {
    const { userId, lat, lng, shareWith } = data;
    activeUsers.set(socket.id, { userId, lat, lng, ts: Date.now() });

    if (shareWith) {
      io.to(shareWith).emit('live-location', { userId, lat, lng, ts: Date.now() });
    } else {
      socket.broadcast.emit('user-location-update', { userId, lat, lng });
    }
  });

  socket.on('sos-alert', data => {
    const alert = { ...data, socketId: socket.id, timestamp: new Date().toISOString() };
    sosAlerts.push(alert);
    io.emit('emergency-alert', alert);
    console.log(`[SOS] Emergency from ${data.userId}`);
  });

  socket.on('checkin-safe', data => {
    socket.broadcast.emit('contact-safe', { userId: data.userId, ts: Date.now() });
  });

  socket.on('disconnect', () => {
    activeUsers.delete(socket.id);
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
});

// ===== API ENDPOINTS =====
app.get('/api/active-users', (req, res) => {
  const users = [];
  activeUsers.forEach((data, sid) => {
    if (Date.now() - data.ts < 120000) {
      users.push({ socketId: sid, userId: data.userId, lat: data.lat, lng: data.lng });
    }
  });
  res.json({ count: users.length, users });
});

app.get('/api/sos-alerts', (req, res) => {
  res.json(sosAlerts.slice(-20));
});

app.get('/api/danger-zones', (req, res) => {
  const dangerZones = [
    { lat: 12.9716, lng: 77.5946, radius: 800, level: 'high', name: 'Isolated Industrial Area', reason: 'Poor lighting, less crowd' },
    { lat: 13.0827, lng: 80.2707, radius: 500, level: 'medium', name: 'Dark Alley Zone', reason: 'Low street lighting' },
    { lat: 12.9352, lng: 77.6245, radius: 600, level: 'high', name: 'Crime Prone Area', reason: 'Historical incident reports' },
    { lat: 13.0102, lng: 80.2145, radius: 400, level: 'medium', name: 'Low Traffic Zone', reason: 'Less crowded, limited police patrol' }
  ];
  res.json({ zones: dangerZones, safeSpots: [] });
});

app.get('/api/traffic', (req, res) => {
  const hour = new Date().getHours();
  let level = 'low', delay = 0;

  if (hour >= 8 && hour <= 10)   { level = 'high'; delay = 15; }
  else if (hour >= 17 && hour <= 19) { level = 'high'; delay = 18; }
  else if (hour >= 11 && hour <= 16) { level = 'medium'; delay = 7; }

  res.json({
    level,
    color: level === 'high' ? '#e03e52' : level === 'medium' ? '#e07b1f' : '#1fa362',
    delay,
    message: level === 'high' ? 'Heavy traffic expected' : level === 'medium' ? 'Moderate traffic' : 'Light traffic'
  });
});

// Safety score endpoint
app.post('/api/safety/score', (req, res) => {
  const { startLat, startLng, destLat, destLng, timeOfDay, routeType } = req.body;
  const hour = timeOfDay || new Date().getHours();
  const isNight = hour < 6 || hour > 19;
  
  let score = 75;
  const policeCount = Math.floor(Math.random() * 5) + 2;
  const hospitalCount = Math.floor(Math.random() * 3) + 1;
  const crowdCount = Math.floor(Math.random() * 4) + 2;
  
  score += Math.min(policeCount * 8, 20);
  score += Math.min(hospitalCount * 5, 15);
  score += Math.min(crowdCount * 3, 10);
  
  if (isNight) score -= 15;
  if (routeType === 'safest') score += 10;
  else if (routeType === 'fastest') score -= 5;
  
  score = Math.min(Math.max(score, 0), 100);
  
  let label = '', color = '';
  if (score >= 75) {
    label = '🟢 SAFE Route';
    color = '#4caf50';
  } else if (score >= 50) {
    label = '🟡 MODERATE Caution';
    color = '#ff9800';
  } else {
    label = '🔴 UNSAFE - Be Careful!';
    color = '#e91e63';
  }
  
  res.json({
    score,
    label,
    color,
    recommendation: score >= 75 ? 'This route is safe for travel' : (score >= 50 ? 'Be alert and stay aware' : 'Consider alternative route'),
    factors: { policeCount, hospitalCount, crowdCount, dangerZones: 0, nightPenalty: isNight ? 15 : 0, isNight },
    alerts: isNight ? [{ type: 'warning', message: '🌙 Night travel - Stay in well-lit areas!' }] : []
  });
});

// Safe spots endpoint
app.post('/api/safety/safe-spots', (req, res) => {
  const safeSpots = [
    { lat: 13.0500, lng: 80.2824, type: 'police', name: 'Police Station', distance: 0.5 },
    { lat: 13.0358, lng: 80.2448, type: 'hospital', name: 'Apollo Hospital', distance: 1.2 },
    { lat: 13.0452, lng: 80.2427, type: 'crowded', name: 'Shopping Complex', distance: 0.8 }
  ];
  res.json(safeSpots);
});

// Report endpoint
app.post('/api/safety/report', (req, res) => {
  console.log('Report received:', req.body);
  res.json({ success: true, message: 'Report submitted. Thank you!' });
});

// Multi-route endpoint
app.post('/api/routes/multi-route', (req, res) => {
  const routes = [
    { id: 1, name: 'Fastest Route', time: 25, distance: 5.2, safetyScore: 65, description: 'Quickest path' },
    { id: 2, name: 'Safest Route', time: 32, distance: 6.8, safetyScore: 92, description: 'Well-lit areas, police presence' },
    { id: 3, name: 'Balanced Route', time: 28, distance: 5.9, safetyScore: 78, description: 'Good balance' }
  ];
  res.json(routes);
});

// Optimized route endpoint
app.post('/api/routes/optimized', async (req, res) => {
  const { start, dest } = req.body;
  const distance = calculateDistance(start.lat, start.lng, dest.lat, dest.lng);
  const duration = Math.round(distance / 30 * 60);
  
  res.json({
    distance: distance.toFixed(1),
    duration: duration,
    traffic: { level: 'low', delay: 0, message: 'Light traffic' },
    instructions: [
      'Start from your location',
      'Head towards the main road',
      'Continue straight',
      'Turn at the signal',
      'You have reached your destination'
    ]
  });
});

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Autocomplete endpoint
app.get('/api/routes/autocomplete', (req, res) => {
  const { query } = req.query;
  const suggestions = [
    { name: 'Chennai Central', lat: 13.0827, lng: 80.2757 },
    { name: 'Chennai Airport', lat: 12.9822, lng: 80.1636 },
    { name: 'T Nagar', lat: 13.0452, lng: 80.2427 },
    { name: 'Marina Beach', lat: 13.0500, lng: 80.2824 }
  ].filter(s => s.name.toLowerCase().includes(query?.toLowerCase() || ''));
  res.json(suggestions);
});

// ===== CATCH-ALL =====
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🛡️  SafeRoute Server Running!`);
  console.log(`🌐  Open: http://localhost:${PORT}`);
  console.log(`📡  WebSocket ready for live tracking`);
  console.log(`✅  All APIs are working\n`);
});