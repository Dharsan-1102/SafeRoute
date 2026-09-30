/**
 * Route Optimization — /api/routes/*
 */

const express = require('express');
const router  = express.Router();
const axios   = require('axios');

// Helper: traffic delay based on hour
function getTrafficDelay() {
  const hour = new Date().getHours();
  if (hour >= 8  && hour <= 10) return { level: 'high',   delay: 15, message: 'Heavy traffic' };
  if (hour >= 17 && hour <= 19) return { level: 'high',   delay: 18, message: 'Heavy traffic' };
  if (hour >= 11 && hour <= 16) return { level: 'medium', delay: 7,  message: 'Moderate traffic' };
  return { level: 'low', delay: 0, message: 'Light traffic' };
}

// ─── POST /optimized ─────────────────────────────────────────
router.post('/optimized', async (req, res) => {
  const { start, dest, preference = 'balanced' } = req.body;

  if (!start || !dest) return res.status(400).json({ error: 'Start and destination required' });

  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson&alternatives=true`;

  try {
    const response = await axios.get(osrmUrl, { timeout: 10000 });
    const routes   = response.data.routes || [];

    if (routes.length === 0) return res.status(404).json({ error: 'No routes found' });

    const traffic = getTrafficDelay();

    const results = routes.slice(0, 3).map((route, i) => ({
      index:       i,
      distance:    parseFloat((route.distance / 1000).toFixed(1)),
      duration:    Math.round(route.duration / 60) + traffic.delay,
      geometry:    route.geometry,
      traffic,
      steps:       (route.legs[0]?.steps || []).map(step => ({
        instruction: step.maneuver?.instruction || 'Continue',
        distance:    Math.round(step.distance),
        duration:    Math.round(step.duration)
      }))
    }));

    res.json(results);
  } catch (err) {
    console.error('Route API error:', err.message);
    res.status(500).json({ error: 'Routing service unavailable', message: err.message });
  }
});

// ─── GET /autocomplete ───────────────────────────────────────
router.get('/autocomplete', async (req, res) => {
  const { query } = req.query;
  if (!query || query.length < 2) return res.json([]);

  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6&lang=en`;
    const response = await axios.get(url, { timeout: 5000 });

    const results = (response.data.features || []).map(f => ({
      name: [f.properties.name, f.properties.city, f.properties.country].filter(Boolean).join(', '),
      lat:  f.geometry.coordinates[1],
      lng:  f.geometry.coordinates[0],
      type: f.properties.osm_value || 'place'
    }));

    res.json(results);
  } catch (err) {
    console.warn('Autocomplete error:', err.message);
    res.json([]);
  }
});

// ─── GET /traffic ─────────────────────────────────────────────
router.get('/traffic', (req, res) => {
  res.json(getTrafficDelay());
});

module.exports = router;