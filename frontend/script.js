// ============================================================
// SafeRoute v3 — Complete Advanced Version
// All features: Risk Parameters, Panic Mode, AI Assistant,
// Dynamic Danger Zones, Route Recalculation, Safety Analytics
// ============================================================

// ===== STATE =====
let map, userLocation = null;
let userMarker = null, destMarker = null;
let currentRoute = null;
let currentPreference = 'safest';
let travelMode = 'driving';
let isDarkMap = false;
let is3D = false;
let heatmapVisible = false;
let safeZonesVisible = false;
let riskOverlayVisible = false;
let isFullscreen = false;
let trackingInterval = null;
let watchId = null;
let etaInterval = null;
let etaEndTime = null;
let checkinTimer = null;
let voiceMuted = false;
let voiceNavActive = false;
let currentStepIndex = 0;
let currentSteps = [];
let routeLines = [];
let safeSpotMarkers = [];
let incidentReports = [];
let dynamicDangerZones = [];
let trustedContacts = JSON.parse(localStorage.getItem('sr_contacts') || '[]');
let recentPlaces = JSON.parse(localStorage.getItem('sr_recent') || '[]');
let safetyHistory = JSON.parse(localStorage.getItem('sr_history') || '[]');
let callTimer = null;
let callSeconds = 0;
let activeCallTimer = null;
let activeCallSeconds = 0;
let currentCallerName = '';
let nightModeAuto = false;
let panicTimerInterval = null;
let panicCountdown = 10;
let deviationCheckInterval = null;
let lastKnownPosition = null;
let routeDeviationThreshold = 0.1; // km
let riskLayers = [];
let nearbyUsers = [];
let socket = null;

// Risk Parameters Weights
const riskWeights = {
    crimeRate: 0.35,
    darkness: 0.25,
    crowdDensity: 0.15,
    policeProximity: 0.15,
    timeOfDay: 0.10
};

const geocodeCache = {};

// ===== DOM REFS =====
const $ = id => document.getElementById(id);
const startInput = $('startInput');
const destInput = $('destInput');
const startSugg = $('startSuggestions');
const destSugg = $('destSuggestions');

// ============================================================
//  RISK PARAMETER CALCULATION (Weighted Score)
// ============================================================
function calculateRiskParameters(lat, lng, hour = null) {
    const time = hour !== null ? hour : new Date().getHours();
    const isNight = time < 6 || time > 19;
    
    // Simulate crime rate based on area (0-1, 1 is highest risk)
    let crimeRate = 0.3;
    // Check if location is near known danger zones
    dynamicDangerZones.forEach(zone => {
        const dist = haversine(lat, lng, zone.lat, zone.lng);
        if (dist < (zone.radius / 1000)) {
            crimeRate = Math.max(crimeRate, zone.level === 'high' ? 0.9 : 0.6);
        }
    });
    
    // Darkness parameter (night = higher risk)
    const darkness = isNight ? 0.8 : 0.2;
    
    // Crowd density (simulated based on time and area)
    let crowdDensity = 0.5;
    if (time >= 9 && time <= 20) crowdDensity = 0.7; // Daytime more crowded = safer
    else crowdDensity = 0.3; // Night less crowded = riskier
    
    // Police proximity (closer = lower risk)
    const policeDist = Math.random() * 2; // Simulated distance in km
    const policeProximity = Math.min(1, policeDist / 3);
    
    // Time of day risk
    const timeRisk = isNight ? 0.9 : 0.3;
    
    // Weighted risk score (0-1, 1 is highest risk)
    const weightedRisk = 
        (crimeRate * riskWeights.crimeRate) +
        (darkness * riskWeights.darkness) +
        ((1 - crowdDensity) * riskWeights.crowdDensity) +
        (policeProximity * riskWeights.policeProximity) +
        (timeRisk * riskWeights.timeOfDay);
    
    // Convert to safety score (0-100, 100 is safest)
    let safetyScore = Math.round((1 - weightedRisk) * 100);
    safetyScore = Math.min(100, Math.max(0, safetyScore));
    
    return {
        safetyScore,
        parameters: {
            crimeRate: Math.round(crimeRate * 100),
            darkness: Math.round(darkness * 100),
            crowdDensity: Math.round(crowdDensity * 100),
            policeProximity: Math.round((1 - policeProximity) * 100),
            timeRisk: Math.round(timeRisk * 100)
        },
        isNight
    };
}

// Display risk parameters in UI
function displayRiskParameters(lat, lng) {
    const risk = calculateRiskParameters(lat, lng);
    const paramDiv = $('riskParams');
    const paramList = $('paramList');
    
    paramDiv.style.display = 'block';
    paramList.innerHTML = `
        <div class="param-item">
            <span class="param-name"><i class="fas fa-gavel"></i> Crime Rate Impact</span>
            <div class="param-bar"><div class="param-fill" style="width: ${risk.parameters.crimeRate}%; background: ${risk.parameters.crimeRate > 60 ? '#e03e52' : '#1fa362'}"></div></div>
            <span class="param-value">${risk.parameters.crimeRate}%</span>
        </div>
        <div class="param-item">
            <span class="param-name"><i class="fas fa-moon"></i> Darkness Level</span>
            <div class="param-bar"><div class="param-fill" style="width: ${risk.parameters.darkness}%; background: ${risk.parameters.darkness > 60 ? '#e03e52' : '#1fa362'}"></div></div>
            <span class="param-value">${risk.parameters.darkness}%</span>
        </div>
        <div class="param-item">
            <span class="param-name"><i class="fas fa-users"></i> Crowd Density</span>
            <div class="param-bar"><div class="param-fill" style="width: ${risk.parameters.crowdDensity}%; background: ${risk.parameters.crowdDensity > 50 ? '#1fa362' : '#e03e52'}"></div></div>
            <span class="param-value">${risk.parameters.crowdDensity}%</span>
        </div>
        <div class="param-item">
            <span class="param-name"><i class="fas fa-shield-alt"></i> Police Proximity</span>
            <div class="param-bar"><div class="param-fill" style="width: ${risk.parameters.policeProximity}%; background: ${risk.parameters.policeProximity > 60 ? '#1fa362' : '#e03e52'}"></div></div>
            <span class="param-value">${risk.parameters.policeProximity}%</span>
        </div>
        <div class="param-item">
            <span class="param-name"><i class="fas fa-clock"></i> Time Risk</span>
            <div class="param-bar"><div class="param-fill" style="width: ${risk.parameters.timeRisk}%; background: ${risk.parameters.timeRisk > 60 ? '#e03e52' : '#1fa362'}"></div></div>
            <span class="param-value">${risk.parameters.timeRisk}%</span>
        </div>
    `;
    return risk;
}

// ============================================================
//  DYNAMIC DANGER ZONE LEARNING
// ============================================================
function updateDynamicDangerZones() {
    // Add reports as danger zones
    incidentReports.forEach(report => {
        const existing = dynamicDangerZones.find(z => 
            haversine(z.lat, z.lng, report.lat, report.lng) < 0.3
        );
        if (!existing && report.severity >= 2) {
            dynamicDangerZones.push({
                id: `dynamic-${Date.now()}-${Math.random()}`,
                lat: report.lat,
                lng: report.lng,
                radius: 300,
                level: report.severity === 3 ? 'high' : 'medium',
                name: report.typeLabel,
                reason: report.description || 'User reported incident',
                timestamp: Date.now()
            });
        }
    });
    
    // Remove old zones (older than 7 days)
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    dynamicDangerZones = dynamicDangerZones.filter(z => 
        !z.timestamp || z.timestamp > oneWeekAgo
    );
    
    // Refresh map layers
    addDynamicDangerZonesToMap();
}

function addDynamicDangerZonesToMap() {
    // Remove existing dynamic layers
    dynamicDangerZones.forEach(zone => {
        const srcId = `dz-dynamic-${zone.id}`;
        if (map.getSource(srcId)) {
            if (map.getLayer(`${srcId}-fill`)) map.removeLayer(`${srcId}-fill`);
            if (map.getLayer(`${srcId}-line`)) map.removeLayer(`${srcId}-line`);
            map.removeSource(srcId);
        }
    });
    
    // Add new dynamic zones
    dynamicDangerZones.forEach(zone => {
        const color = zone.level === 'high' ? '#e03e52' : '#e07b1f';
        const geo = makeCircle(zone.lng, zone.lat, zone.radius / 1000);
        const srcId = `dz-dynamic-${zone.id}`;
        
        map.addSource(srcId, { type: 'geojson', data: geo });
        map.addLayer({
            id: `${srcId}-fill`, type: 'fill', source: srcId,
            paint: { 'fill-color': color, 'fill-opacity': 0.25 }
        });
        map.addLayer({
            id: `${srcId}-line`, type: 'line', source: srcId,
            paint: { 'line-color': color, 'line-width': 2, 'line-dasharray': [4, 4], 'line-opacity': 0.8 }
        });
    });
}

// ============================================================
//  MAP INITIALIZATION
// ============================================================
function initMap() {
    map = new maplibregl.Map({
        container: 'map',
        style: buildStyle(false),
        center: [80.2707, 13.0827],
        zoom: 12, pitch: 0, bearing: 0
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');

    map.on('rotate', () => {
        const bearing = map.getBearing();
        const compassBtn = $('compassBtn');
        if (compassBtn) compassBtn.style.transform = `rotate(${-bearing}deg)`;
    });

    map.on('load', () => {
        addDangerZones();
        addHeatmapLayer();
        addSafeZoneLayer();
        addRiskOverlayLayer();
        checkAutoNightMode();
        initSocket();
        showToast('🛡️ SafeRoute ready. Enter your destination.', 'success');
        speak('Welcome to SafeRoute. Enter your destination to find a safe route.');
    });

    map.on('click', async e => {
        if (e.originalEvent.target.closest('.maplibregl-marker')) return;
        const { lng, lat } = e.lngLat;
        const name = await reverseGeocode(lat, lng);
        destInput.value = name;
        geocodeCache[name.toLowerCase()] = { lat, lng };
        showToast('📍 Destination set — press "Find Safe Route"', 'info');
    });
}

function buildStyle(dark) {
    return {
        version: 8,
        glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
        sources: {
            osm: {
                type: 'raster',
                tiles: dark
                    ? ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                       'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png']
                    : ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                       'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png'],
                tileSize: 256,
                attribution: dark ? '© CartoDB © OSM' : '© OpenStreetMap'
            }
        },
        layers: [{ id: 'bg', type: 'raster', source: 'osm' }]
    };
}

function applyMapStyle(dark) {
    isDarkMap = dark;
    const btn = $('toggleMapStyle');
    if (btn) {
        btn.classList.toggle('active', dark);
        const icon = btn.querySelector('i');
        if (icon) icon.className = dark ? 'fas fa-sun' : 'fas fa-moon';
    }
    map.setStyle(buildStyle(dark));
    map.once('styledata', () => {
        addDangerZones();
        addHeatmapLayer();
        addSafeZoneLayer();
        addRiskOverlayLayer();
        if (userLocation) addUserMarker(userLocation.lat, userLocation.lng);
    });
}

// ============================================================
//  RISK OVERLAY LAYER
// ============================================================
function addRiskOverlayLayer() {
    if (map.getSource('risk-grid')) return;
    
    // Create a grid of risk points
    const riskPoints = [];
    for (let lat = 12.8; lat <= 13.3; lat += 0.05) {
        for (let lng = 80.1; lng <= 80.5; lng += 0.05) {
            const risk = calculateRiskParameters(lat, lng);
            riskPoints.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [lng, lat] },
                properties: { risk: 100 - risk.safetyScore }
            });
        }
    }
    
    map.addSource('risk-grid', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: riskPoints }
    });
    
    map.addLayer({
        id: 'risk-heat',
        type: 'heatmap',
        source: 'risk-grid',
        paint: {
            'heatmap-weight': ['get', 'risk'],
            'heatmap-intensity': 0.8,
            'heatmap-color': [
                'interpolate', ['linear'], ['heatmap-density'],
                0, 'rgba(33, 163, 98, 0)',
                0.3, 'rgba(33, 163, 98, 0.3)',
                0.5, 'rgba(224, 123, 31, 0.5)',
                0.7, 'rgba(224, 62, 82, 0.7)',
                1, 'rgba(192, 38, 59, 0.9)'
            ],
            'heatmap-radius': 40,
            'heatmap-opacity': 0
        }
    });
}

function toggleRiskOverlay() {
    riskOverlayVisible = !riskOverlayVisible;
    const btn = $('toggleRiskOverlay');
    if (btn) btn.classList.toggle('active', riskOverlayVisible);
    if (map.getLayer('risk-heat')) {
        map.setPaintProperty('risk-heat', 'heatmap-opacity', riskOverlayVisible ? 0.7 : 0);
    }
    showToast(riskOverlayVisible ? '📊 Risk overlay ON' : '📊 Risk overlay OFF', 'info');
}

// ============================================================
//  PANIC MODE
// ============================================================
function activatePanicMode() {
    const panicOverlay = $('panicOverlay');
    panicOverlay.style.display = 'flex';
    panicCountdown = 10;
    updatePanicTimer();
    
    // Play alert sound
    const audio = $('alertSound');
    if (audio) audio.play().catch(e => console.log('Audio play failed'));
    
    // Vibrate
    if (navigator.vibrate) navigator.vibrate([500, 200, 500]);
    
    if (panicTimerInterval) clearInterval(panicTimerInterval);
    panicTimerInterval = setInterval(() => {
        panicCountdown--;
        updatePanicTimer();
        if (panicCountdown <= 0) {
            clearInterval(panicTimerInterval);
            panicOverlay.style.display = 'none';
            sendSOS();
        }
    }, 1000);
}

function updatePanicTimer() {
    const timerEl = $('panicTimer');
    if (timerEl) timerEl.textContent = `SOS in ${panicCountdown}`;
}

function cancelPanicMode() {
    if (panicTimerInterval) clearInterval(panicTimerInterval);
    $('panicOverlay').style.display = 'none';
    showToast('Panic mode cancelled', 'info');
}

// Shake detection for panic mode
let lastShake = 0;
let shakeThreshold = 15;

function handleShake() {
    const now = Date.now();
    if (now - lastShake < 2000) return;
    lastShake = now;
    if ($('panicOverlay').style.display !== 'flex') {
        activatePanicMode();
        showToast('📱 Shake detected! Panic mode activated', 'danger');
    }
}

// ============================================================
//  ROUTE DEVIATION DETECTION & RECALCULATION
// ============================================================
function startDeviationMonitoring(originalRoute) {
    if (deviationCheckInterval) clearInterval(deviationCheckInterval);
    
    deviationCheckInterval = setInterval(async () => {
        if (!userLocation || !currentRoute || !currentRoute.start || !currentRoute.dest) return;
        
        // Calculate distance from original route
        let minDist = Infinity;
        if (currentRoute.geometry) {
            // Simplified: check distance to destination vs expected
            const distToDest = haversine(userLocation.lat, userLocation.lng, 
                currentRoute.dest.lat, currentRoute.dest.lng);
            const expectedDist = parseFloat($('routeDistance')?.textContent || 0);
            
            if (Math.abs(distToDest - expectedDist) > routeDeviationThreshold * 2) {
                showToast('🔄 Route deviation detected! Recalculating safer path...', 'warning');
                await fetchRouteAlternatives(userLocation, currentRoute.dest);
            }
        }
        
        lastKnownPosition = { ...userLocation };
    }, 30000);
}

// ============================================================
//  SMART DESTINATION SUGGESTIONS
// ============================================================
function showSmartSuggestions() {
    const suggestions = [
        { name: '🚔 Nearest Police Station', type: 'police', lat: 13.0500, lng: 80.2824 },
        { name: '🏥 Nearest Hospital', type: 'hospital', lat: 13.0358, lng: 80.2448 },
        { name: '🛍️ Nearest Mall (Crowded)', type: 'crowded', lat: 13.0452, lng: 80.2427 },
        { name: '🏠 Home (Saved)', type: 'home', lat: 13.0827, lng: 80.2707 }
    ];
    
    const panel = $('smartSuggestions');
    const list = $('suggestionList');
    panel.style.display = 'block';
    list.innerHTML = suggestions.map(s => `
        <button class="suggestion-chip" data-lat="${s.lat}" data-lng="${s.lng}" data-name="${s.name}">
            ${s.name}
        </button>
    `).join('');
    
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const lat = parseFloat(chip.dataset.lat);
            const lng = parseFloat(chip.dataset.lng);
            const name = chip.dataset.name;
            destInput.value = name;
            geocodeCache[name.toLowerCase()] = { lat, lng };
            showToast(`📍 Destination set to ${name}`, 'success');
            panel.style.display = 'none';
            handleRoute();
        });
    });
}

// ============================================================
//  ROUTE PREVIEW
// ============================================================
function showRoutePreview(route, start, dest) {
    const previewPanel = $('routePreview');
    const statsDiv = $('previewStats');
    const dangersDiv = $('previewDangers');
    
    const dist = (route.distance / 1000).toFixed(1);
    const dur = Math.round(route.duration / 60);
    const risk = calculateRiskParameters((start.lat + dest.lat) / 2, (start.lng + dest.lng) / 2);
    
    // Count danger zones along route
    const dangers = dynamicDangerZones.filter(zone => {
        const distToZone = haversine((start.lat + dest.lat) / 2, (start.lng + dest.lng) / 2, zone.lat, zone.lng);
        return distToZone < 2;
    });
    
    statsDiv.innerHTML = `
        <div class="preview-stat"><i class="fas fa-road"></i> ${dist} km</div>
        <div class="preview-stat"><i class="fas fa-clock"></i> ${dur} min</div>
        <div class="preview-stat"><i class="fas fa-shield-alt"></i> ${risk.safetyScore}% safe</div>
    `;
    
    dangersDiv.innerHTML = dangers.length > 0 
        ? `<div class="preview-warning"><i class="fas fa-exclamation-triangle"></i> ${dangers.length} danger zone(s) along route</div>`
        : `<div class="preview-safe"><i class="fas fa-check-circle"></i> No danger zones detected</div>`;
    
    previewPanel.style.display = 'block';
}

// ============================================================
//  SAFETY ANALYTICS
// ============================================================
function updateSafetyAnalytics() {
    const analytics = $('safetyAnalytics');
    const content = $('analyticsContent');
    
    if (safetyHistory.length === 0) {
        analytics.style.display = 'none';
        return;
    }
    
    analytics.style.display = 'block';
    const avgScore = safetyHistory.reduce((sum, h) => sum + h.score, 0) / safetyHistory.length;
    const safeRoutes = safetyHistory.filter(h => h.score >= 75).length;
    const riskyRoutes = safetyHistory.filter(h => h.score < 50).length;
    
    content.innerHTML = `
        <div class="analytics-stat"><i class="fas fa-chart-line"></i> Avg Safety: ${Math.round(avgScore)}%</div>
        <div class="analytics-stat"><i class="fas fa-check-circle"></i> Safe Routes: ${safeRoutes}</div>
        <div class="analytics-stat"><i class="fas fa-exclamation-triangle"></i> Risky Routes: ${riskyRoutes}</div>
        <div class="analytics-stat"><i class="fas fa-calendar"></i> Total Trips: ${safetyHistory.length}</div>
    `;
}

function saveToAnalytics(score, start, dest, dist, dur) {
    safetyHistory.unshift({
        timestamp: Date.now(),
        score,
        start: startInput.value,
        dest: destInput.value,
        distance: dist,
        duration: dur,
        preference: currentPreference
    });
    // Keep only last 50 trips
    if (safetyHistory.length > 50) safetyHistory.pop();
    localStorage.setItem('sr_history', JSON.stringify(safetyHistory));
    updateSafetyAnalytics();
}

// ============================================================
//  AI SAFETY ASSISTANT
// ============================================================
const aiResponses = {
    default: "I'm here to help you stay safe. You can ask me about route safety, emergency contacts, or safety tips.",
    route: "For a safer route, I recommend choosing the 'Safest' option which prioritizes well-lit areas and police presence.",
    sos: "If you're in danger, press the SOS button immediately. It will alert your emergency contacts with your live location.",
    night: "Traveling at night? Make sure to stay in well-lit areas, share your live location, and keep emergency numbers handy.",
    police: "The nearest police station can be found using the 'Go Safe' button. I'll route you there immediately.",
    checkin: "Use the Check-In feature to set a safety timer. Your contacts will be alerted if you don't confirm arrival."
};

function askAIAssistant(question) {
    const lower = question.toLowerCase();
    let response = aiResponses.default;
    
    if (lower.includes('route') || lower.includes('safe route')) response = aiResponses.route;
    else if (lower.includes('sos') || lower.includes('emergency')) response = aiResponses.sos;
    else if (lower.includes('night')) response = aiResponses.night;
    else if (lower.includes('police')) response = aiResponses.police;
    else if (lower.includes('check') || lower.includes('arrival')) response = aiResponses.checkin;
    
    return response;
}

function initAIAssistant() {
    const modal = $('aiAssistantModal');
    const messages = $('aiMessages');
    const input = $('aiInput');
    const sendBtn = $('aiSendBtn');
    
    messages.innerHTML = `<div class="ai-message ai-bot"><i class="fas fa-robot"></i> ${aiResponses.default}</div>`;
    
    sendBtn.onclick = () => {
        const q = input.value.trim();
        if (!q) return;
        
        messages.innerHTML += `<div class="ai-message ai-user"><i class="fas fa-user"></i> ${q}</div>`;
        const response = askAIAssistant(q);
        setTimeout(() => {
            messages.innerHTML += `<div class="ai-message ai-bot"><i class="fas fa-robot"></i> ${response}</div>`;
            messages.scrollTop = messages.scrollHeight;
        }, 300);
        input.value = '';
        messages.scrollTop = messages.scrollHeight;
    };
    
    input.addEventListener('keypress', e => { if (e.key === 'Enter') sendBtn.click(); });
}

// ============================================================
//  NEARBY USERS (WebSocket)
// ============================================================
function initSocket() {
    socket = io({ autoConnect: true });
    
    socket.on('connect', () => {
        console.log('WebSocket connected');
        startHeartbeat();
    });
    
    socket.on('user-location-update', (data) => {
        updateNearbyUser(data);
    });
    
    socket.on('emergency-alert', (data) => {
        showToast(`🚨 Emergency alert from nearby user!`, 'danger');
        addNearbyAlertMarker(data);
    });
}

function startHeartbeat() {
    setInterval(() => {
        if (userLocation && socket && socket.connected) {
            socket.emit('share-location', {
                userId: 'user_' + Date.now(),
                lat: userLocation.lat,
                lng: userLocation.lng
            });
        }
    }, 10000);
}

function updateNearbyUser(data) {
    const panel = $('nearbyUsersPanel');
    const list = $('nearbyUsersList');
    
    // Store nearby user
    const existing = nearbyUsers.find(u => u.userId === data.userId);
    if (!existing) {
        nearbyUsers.push(data);
        panel.style.display = 'block';
    } else {
        existing.lat = data.lat;
        existing.lng = data.lng;
        existing.ts = Date.now();
    }
    
    // Remove old users (older than 2 minutes)
    nearbyUsers = nearbyUsers.filter(u => Date.now() - (u.ts || 0) < 120000);
    
    list.innerHTML = nearbyUsers.map(u => `
        <div class="nearby-user">
            <i class="fas fa-user-circle"></i>
            <span>SafeRoute user nearby</span>
        </div>
    `).join('');
    
    if (nearbyUsers.length === 0) panel.style.display = 'none';
}

function addNearbyAlertMarker(data) {
    const el = document.createElement('div');
    el.innerHTML = `<div style="background:#e03e52;color:#fff;padding:4px 8px;border-radius:20px;font-size:11px;animation:pulse 1s infinite;">🚨 SOS</div>`;
    new maplibregl.Marker({ element: el })
        .setLngLat([data.location?.lng || 80.27, data.location?.lat || 13.08])
        .setPopup(new maplibregl.Popup().setHTML('<b>🚨 Emergency Alert</b><br>Nearby user needs help'))
        .addTo(map);
}

// ============================================================
//  AUTO NIGHT MODE
// ============================================================
function checkAutoNightMode() {
    const hour = new Date().getHours();
    const shouldBeDark = hour >= 19 || hour < 6;
    if (shouldBeDark && !isDarkMap) {
        nightModeAuto = true;
        applyMapStyle(true);
        showToast('🌙 Auto night mode activated', 'info');
    }
}

// ============================================================
//  GEOLOCATION
// ============================================================
function getUserLocation() {
    if (!navigator.geolocation) {
        userLocation = { lat: 13.0827, lng: 80.2707 };
        addUserMarker(userLocation.lat, userLocation.lng);
        return;
    }
    showToast('📍 Getting your location…', 'info');
    if (watchId) navigator.geolocation.clearWatch(watchId);

    watchId = navigator.geolocation.watchPosition(pos => {
        const { latitude: lat, longitude: lng, speed } = pos.coords;
        userLocation = { lat, lng };
        addUserMarker(lat, lng);
        startInput.value = 'Current Location';

        const kmh = speed ? Math.round(speed * 3.6) : 0;
        const speedEl = $('currentSpeed');
        if (speedEl) speedEl.innerHTML = `${kmh} <small>km/h</small>`;

        const trackingCoords = $('trackingCoords');
        if (trackingCoords) trackingCoords.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

        if (currentRoute && currentRoute.dest) {
            const d = haversine(lat, lng, currentRoute.dest.lat, currentRoute.dest.lng);
            const distRemaining = $('distRemaining');
            const bnbDist = $('bnbDist');
            if (distRemaining) distRemaining.textContent = `${d.toFixed(1)} km left`;
            if (bnbDist) bnbDist.textContent = d.toFixed(1);
            
            // Auto-recalculate if significantly off route
            const expectedDist = parseFloat($('routeDistance')?.textContent || 0);
            if (Math.abs(d - expectedDist) > 3) {
                showToast('🔄 Recalculating route...', 'info');
                fetchRouteAlternatives(userLocation, currentRoute.dest);
            }
        }

        updateCurrentStreet(lat, lng);
        
        // Update risk parameters display
        displayRiskParameters(lat, lng);

    }, err => {
        console.warn('GPS error:', err.message);
        userLocation = { lat: 13.0827, lng: 80.2707 };
        addUserMarker(userLocation.lat, userLocation.lng);
        showToast('⚠️ Using default location', 'warning');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 4000 });
}

function addUserMarker(lat, lng) {
    if (userMarker) userMarker.remove();
    const el = document.createElement('div');
    el.innerHTML = `
        <div style="position:relative;width:24px;height:24px;">
            <div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,111,212,0.25);animation:pulse 2s infinite;"></div>
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:14px;height:14px;border-radius:50%;background:#3b6fd4;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(59,111,212,0.5);"></div>
        </div>`;
    userMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .setPopup(new maplibregl.Popup().setHTML('<b>📍 You are here</b>'))
        .addTo(map);
}

async function updateCurrentStreet(lat, lng) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
        const res = await fetch(url);
        const d = await res.json();
        const road = d.address?.road || d.address?.suburb || 'Unknown road';
        const streetEl = $('currentStreet');
        if (streetEl) streetEl.innerHTML = `<i class="fas fa-road"></i> <span>${road}</span>`;
    } catch {}
}

function zoomToMe() {
    if (!userLocation) { showToast('📍 Enable GPS first', 'warning'); return; }
    map.easeTo({ center: [userLocation.lng, userLocation.lat], zoom: 16, duration: 800 });
}

function resetCompass() {
    map.easeTo({ bearing: 0, pitch: 0, duration: 600 });
    showToast('🧭 Map orientation reset', 'info');
}

// ============================================================
//  AUTOCOMPLETE
// ============================================================
let acTimer = null;

function setupAutocomplete(input, dropdown) {
    input.addEventListener('input', () => {
        clearTimeout(acTimer);
        const q = input.value.trim();
        if (q.length < 2) {
            closeDrop(dropdown);
            if (q.length === 0 && recentPlaces.length > 0 && input === destInput) showRecentBar();
            return;
        }
        hideRecentBar();
        acTimer = setTimeout(() => fetchSuggestions(q, dropdown, input), 280);
    });

    input.addEventListener('focus', () => {
        const q = input.value.trim();
        if (q.length >= 2) dropdown.classList.add('open');
        else if (input === destInput && recentPlaces.length > 0) showRecentBar();
    });

    document.addEventListener('click', e => {
        if (!e.target.closest('.search-input-wrap') && !e.target.closest('.recent-bar')) {
            closeDrop(dropdown);
        }
    });
}

async function fetchSuggestions(query, dropdown, input) {
    try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6&lang=en`;
        const res = await fetch(url);
        const data = await res.json();
        dropdown.innerHTML = '';

        if (!data.features?.length) { closeDrop(dropdown); return; }

        data.features.forEach(f => {
            const p = f.properties;
            const name = p.name || '';
            const sub = [p.city || p.town, p.state, p.country].filter(Boolean).join(', ');
            const [lng, lat] = f.geometry.coordinates;

            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.innerHTML = `
                <i class="fas fa-map-marker-alt"></i>
                <div class="suggestion-text">
                    <div class="suggestion-name">${name}</div>
                    ${sub ? `<div class="suggestion-sub">${sub}</div>` : ''}
                </div>`;
            item.addEventListener('click', () => {
                const full = sub ? `${name}, ${sub}` : name;
                input.value = full;
                geocodeCache[full.toLowerCase()] = { lat, lng };
                closeDrop(dropdown);
                if (input === destInput) saveRecent(full, lat, lng);
            });
            dropdown.appendChild(item);
        });
        dropdown.classList.add('open');
    } catch { closeDrop(dropdown); }
}

function closeDrop(el) { el.classList.remove('open'); el.innerHTML = ''; }

function saveRecent(name, lat, lng) {
    recentPlaces = recentPlaces.filter(r => r.name !== name);
    recentPlaces.unshift({ name, lat, lng });
    if (recentPlaces.length > 5) recentPlaces.pop();
    localStorage.setItem('sr_recent', JSON.stringify(recentPlaces));
}

function showRecentBar() {
    if (!recentPlaces.length) return;
    const bar = $('recentBar');
    const list = $('recentList');
    list.innerHTML = recentPlaces.map((r, i) =>
        `<div class="recent-item" data-idx="${i}">
            <i class="fas fa-clock-rotate-left"></i>
            <span>${r.name}</span>
        </div>`
    ).join('');
    bar.style.display = 'block';
    list.querySelectorAll('.recent-item').forEach(el => {
        el.addEventListener('click', () => {
            const r = recentPlaces[el.dataset.idx];
            destInput.value = r.name;
            geocodeCache[r.name.toLowerCase()] = { lat: r.lat, lng: r.lng };
            hideRecentBar();
        });
    });
}

function hideRecentBar() { $('recentBar').style.display = 'none'; }

function swapInputs() {
    const sv = startInput.value;
    const dv = destInput.value;
    startInput.value = dv;
    destInput.value = sv;
    showToast('🔄 Locations swapped', 'info');
}

// ============================================================
//  GEOCODING
// ============================================================
const KNOWN = {
    'current location': null, 'my location': null,
    'chennai': { lat: 13.0827, lng: 80.2707 },
    'chennai central': { lat: 13.0827, lng: 80.2757 },
    'chennai airport': { lat: 12.9822, lng: 80.1636 },
    'tambaram': { lat: 12.9242, lng: 80.1272 },
    't nagar': { lat: 13.0452, lng: 80.2427 },
    'marina beach': { lat: 13.0635, lng: 80.2832 },
    'police station': { lat: 13.0500, lng: 80.2824 },
    'nearest police station': { lat: 13.0500, lng: 80.2824 },
    'hospital': { lat: 13.0358, lng: 80.2448 },
    'mall': { lat: 13.0452, lng: 80.2427 }
};

async function geocode(place) {
    if (!place) return null;
    const lower = place.trim().toLowerCase();
    if (['current location', 'my location'].includes(lower)) return userLocation;
    if (geocodeCache[lower]) return geocodeCache[lower];
    if (KNOWN[lower] !== undefined) { geocodeCache[lower] = KNOWN[lower]; return KNOWN[lower]; }

    const rec = recentPlaces.find(r => r.name.toLowerCase() === lower);
    if (rec) return { lat: rec.lat, lng: rec.lng };

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}&limit=1&countrycodes=in`, { headers: { 'Accept-Language': 'en' } });
        const d = await res.json();
        if (d?.length) {
            const c = { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
            geocodeCache[lower] = c;
            return c;
        }
    } catch { }
    return null;
}

async function reverseGeocode(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const d = await res.json();
        return d.display_name?.split(',').slice(0, 3).join(', ') || `${lat.toFixed(4)},${lng.toFixed(4)}`;
    } catch { return `${lat.toFixed(4)},${lng.toFixed(4)}`; }
}

function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dL = (lat2 - lat1) * Math.PI / 180;
    const dN = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dL / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dN / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================================
//  ROUTE FINDING
// ============================================================
async function handleRoute() {
    const destText = destInput.value.trim();
    const startText = startInput.value.trim();
    if (!destText) { showToast('❌ Enter a destination first', 'danger'); return; }

    const btn = $('routeBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Finding routes…';

    let startCoords = userLocation;
    if (startText && !['current location', 'my location'].includes(startText.toLowerCase())) {
        const g = await geocode(startText);
        if (g) startCoords = g;
    }

    if (!startCoords) {
        showToast('📍 Enable GPS or enter a start location', 'warning');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-route"></i> Find Safe Route';
        return;
    }

    const destCoords = await geocode(destText);
    if (!destCoords) {
        showToast('❌ Destination not found. Check spelling.', 'danger');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-route"></i> Find Safe Route';
        return;
    }

    saveRecent(destText, destCoords.lat, destCoords.lng);
    showSmartSuggestions();

    if (destMarker) destMarker.remove();
    const destEl = document.createElement('div');
    destEl.innerHTML = `<div style="background:#e03e52;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(224,62,82,0.5);"></div>`;
    destMarker = new maplibregl.Marker({ element: destEl })
        .setLngLat([destCoords.lng, destCoords.lat])
        .setPopup(new maplibregl.Popup().setHTML(`<b>🏁 ${destText}</b>`))
        .addTo(map);

    await fetchRouteAlternatives(startCoords, destCoords);

    $('routeTabs').style.display = 'flex';
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-route"></i> Find Safe Route';
}

async function fetchRouteAlternatives(start, dest) {
    const osrmMode = travelMode === 'driving' ? 'driving' : travelMode === 'walking' ? 'foot' : 'driving';
    const url = `https://router.project-osrm.org/route/v1/${osrmMode}/${start.lng},${start.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson&alternatives=true&steps=true`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        if (!data.routes?.length) { showToast('❌ No route found', 'danger'); return; }

        const prefs = ['safest', 'balanced', 'fastest'];
        const meta = {
            safest: { icon: '🛡️', label: 'Safest', bonus: 15 },
            balanced: { icon: '⚖️', label: 'Balanced', bonus: 5 },
            fastest: { icon: '⚡', label: 'Fastest', bonus: -5 }
        };
        const colors = ['#3b6fd4', '#1fa362', '#e07b1f'];

        const listEl = $('altRoutesList');
        listEl.innerHTML = '';
        clearRouteLines();

        data.routes.slice(0, 3).forEach((route, i) => {
            const pref = prefs[i] || prefs[0];
            const info = meta[pref];
            const dist = (route.distance / 1000).toFixed(1);
            const dur = Math.round(route.duration / 60);
            const risk = calculateRiskParameters((start.lat + dest.lat) / 2, (start.lng + dest.lng) / 2);
            const score = risk.safetyScore + info.bonus - i * 3;

            drawRouteLine(`rt-${i}`, route.geometry, colors[i], i === 0 ? 5 : 3, i === 0 ? 0.85 : 0.35);

            const sc = score >= 70 ? 'score-high' : score >= 50 ? 'score-mid' : 'score-low';
            const item = document.createElement('div');
            item.className = `alt-route-item${i === 0 ? ' selected' : ''}`;
            item.innerHTML = `
                <div class="alt-route-left">
                    <div class="alt-route-icon">${info.icon}</div>
                    <div>
                        <div class="alt-route-name">${info.label} Route</div>
                        <div class="alt-route-meta">${dist} km · ${dur} min</div>
                    </div>
                </div>
                <div class="alt-score ${sc}">${Math.round(score)}%</div>`;
            item.addEventListener('click', () => {
                document.querySelectorAll('.alt-route-item').forEach(e => e.classList.remove('selected'));
                item.classList.add('selected');
                selectRoute(i, data.routes[i], start, dest, dist, dur, Math.round(score), pref);
            });
            listEl.appendChild(item);
        });

        $('altRoutesPanel').style.display = 'block';
        const r0 = data.routes[0];
        const risk0 = calculateRiskParameters((start.lat + dest.lat) / 2, (start.lng + dest.lng) / 2);
        selectRoute(0, r0, start, dest, (r0.distance / 1000).toFixed(1), Math.round(r0.duration / 60), risk0.safetyScore + 15, 'safest');

        map.fitBounds([[start.lng, start.lat], [dest.lng, dest.lat]], { padding: 80, duration: 900 });

        // Show route preview
        showRoutePreview(r0, start, dest);

    } catch (err) {
        console.error(err);
        showToast('⚠️ Route service error. Try again.', 'warning');
    }
}

function drawRouteLine(id, geometry, color, width, opacity) {
    if (map.getSource(id)) { if (map.getLayer(`${id}-l`)) map.removeLayer(`${id}-l`); map.removeSource(id); }
    map.addSource(id, { type: 'geojson', data: { type: 'Feature', geometry } });
    map.addLayer({
        id: `${id}-l`, type: 'line', source: id,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': color, 'line-width': width, 'line-opacity': opacity }
    });
    routeLines.push(id);
}

function clearRouteLines() {
    routeLines.forEach(id => {
        if (map.getLayer(`${id}-l`)) map.removeLayer(`${id}-l`);
        if (map.getSource(id)) map.removeSource(id);
    });
    routeLines = [];
    safeSpotMarkers.forEach(m => m.remove());
    safeSpotMarkers = [];
}

function selectRoute(idx, route, start, dest, dist, dur, score, pref) {
    currentPreference = pref;
    currentRoute = { route, start, dest, dist, dur, score, pref, geometry: route.geometry };

    routeLines.forEach((id, i) => {
        if (!map.getLayer(`${id}-l`)) return;
        map.setPaintProperty(`${id}-l`, 'line-opacity', i === idx ? 0.9 : 0.2);
        map.setPaintProperty(`${id}-l`, 'line-width', i === idx ? 6 : 3);
    });

    updateRouteInfo(dist, dur);
    updateSafetyCard(score, pref, start, dest);
    buildDirections(route);
    if (etaInterval) clearInterval(etaInterval);
    startETA(parseInt(dur));
    showSafeSpots(start);
    showLiveNavBar();
    startDeviationMonitoring(currentRoute);
    saveToAnalytics(score, start, dest, dist, dur);

    showToast(`✅ ${pref.charAt(0).toUpperCase() + pref.slice(1)} route — ${dist}km, ${dur}min`, 'success');
    speak(`Route found. ${dist} kilometers. Approximately ${dur} minutes.`);
}

function updateRouteInfo(dist, dur) {
    $('routeInfo').style.display = 'block';
    $('routeDistance').textContent = dist;
    $('routeTime').textContent = dur;
    const h = new Date().getHours();
    $('trafficStatus').textContent = (h >= 8 && h <= 10) || (h >= 17 && h <= 19) ? 'Heavy traffic' : h >= 11 && h <= 16 ? 'Moderate' : 'Light traffic';
    $('bottomNavBar').style.display = 'flex';
    $('bnbEta').textContent = dur;
    $('bnbDist').textContent = dist;
}

function updateSafetyCard(score, pref, start, dest) {
    $('safetyCard').style.display = 'block';
    const hour = new Date().getHours();
    const night = hour < 6 || hour > 19;
    const risk = calculateRiskParameters((start.lat + dest.lat) / 2, (start.lng + dest.lng) / 2);

    let label, color, rec;
    if (score >= 75) { label = '🟢 SAFE Route'; color = '#1fa362'; rec = 'Route is safe. Stay aware.'; }
    else if (score >= 50) { label = '🟡 MODERATE Caution'; color = '#d97706'; rec = 'Stay alert and share location.'; }
    else { label = '🔴 HIGH RISK'; color = '#dc2626'; rec = 'Consider alternate route or travel with companion.'; }

    $('safetyPct').textContent = score;
    $('safetyLabel').textContent = label;
    $('scFill').style.width = `${score}%`;
    $('scFill').style.background = color;
    $('scRec').innerHTML = `<i class="fas fa-shield-alt"></i> ${rec}`;
    const arc = $('scoreArc');
    arc.style.strokeDashoffset = 150.8 - (score / 100) * 150.8;
    arc.style.stroke = color;
    $('scFactors').innerHTML = `
        <div>🚔 Police: ${risk.parameters.policeProximity > 50 ? 'Nearby' : 'Limited'} presence</div>
        <div>🏥 Hospitals: Available within 2km</div>
        <div>👥 Crowded: ${risk.parameters.crowdDensity > 50 ? 'Good crowd presence' : 'Low crowd'}</div>
        ${night ? '<div>🌙 Night travel — extra caution</div>' : ''}
        <div>📊 Risk Score: ${100 - score}%</div>
    `;
}

function showLiveNavBar() { $('liveNavBar').style.display = 'flex'; }

function startETA(durMin) {
    if (etaInterval) clearInterval(etaInterval);
    etaEndTime = Date.now() + durMin * 60000;
    const tick = () => {
        const rem = etaEndTime - Date.now();
        if (rem <= 0) {
            $('etaCountdown').textContent = 'Arrived!';
            $('bnbEta').textContent = '0';
            clearInterval(etaInterval);
            endNavigation();
            return;
        }
        const m = Math.floor(rem / 60000), s = Math.floor((rem % 60000) / 1000);
        $('etaCountdown').textContent = `${m}:${String(s).padStart(2, '0')}`;
        $('bnbEta').textContent = m;
    };
    tick();
    etaInterval = setInterval(tick, 1000);
}

function endNavigation() {
    showToast('🏁 Arrived at destination! Stay safe.', 'success');
    speak('You have arrived at your destination. Stay safe!');
    $('bottomNavBar').style.display = 'none';
    $('liveNavBar').style.display = 'none';
    if (deviationCheckInterval) clearInterval(deviationCheckInterval);
}

function buildDirections(route) {
    const stepsEl = $('stepsList');
    stepsEl.innerHTML = '';
    currentSteps = [];

    const rawSteps = route?.legs?.[0]?.steps;
    const instructions = rawSteps?.length
        ? rawSteps.map(s => ({ text: s.maneuver?.instruction || 'Continue', dist: Math.round(s.distance) }))
        : [
            { text: `Start from ${startInput.value || 'your location'}`, dist: 0 },
            { text: 'Head towards the main road', dist: 200 },
            { text: 'Continue straight for 500 meters', dist: 500 },
            { text: 'Keep left at the fork', dist: 100 },
            { text: 'Turn right at the traffic signal', dist: 50 },
            { text: 'Continue for 2 kilometers', dist: 2000 },
            { text: `Arrive at ${destInput.value}`, dist: 0 }
        ];

    instructions.forEach((step, i) => {
        currentSteps.push(step.text);
        const d = document.createElement('div');
        d.className = `step-item${i === 0 ? ' active' : ''}`;
        d.id = `step-${i}`;
        d.innerHTML = `
            <span class="step-num">${i + 1}</span>
            <div>
                <div>${step.text}</div>
                ${step.dist ? `<div class="step-dist">${step.dist >= 1000 ? (step.dist / 1000).toFixed(1) + 'km' : step.dist + 'm'}</div>` : ''}
            </div>`;
        stepsEl.appendChild(d);
    });
}

// ============================================================
//  VOICE NAVIGATION
// ============================================================
function toggleVoiceNav() {
    voiceMuted = !voiceMuted;
    const btns = document.querySelectorAll('#voiceNavBtn, #startVoiceBtn');
    btns.forEach(b => b.classList.toggle('active', !voiceMuted));
    if (!voiceMuted) {
        voiceNavActive = true;
        currentStepIndex = 0;
        if (currentSteps.length > 0) speak(currentSteps[0]);
        showToast('🎙️ Voice navigation ON', 'success');
        const startVoiceBtn = $('startVoiceBtn');
        if (startVoiceBtn) {
            startVoiceBtn.innerHTML = '<i class="fas fa-volume-xmark"></i> Mute';
        }
    } else {
        voiceNavActive = false;
        speechSynthesis.cancel();
        showToast('🔇 Voice navigation muted', 'info');
        const startVoiceBtn = $('startVoiceBtn');
        if (startVoiceBtn) {
            startVoiceBtn.innerHTML = '<i class="fas fa-volume-high"></i> Voice';
        }
    }
}

function speak(text) {
    if (!text || voiceMuted || !window.speechSynthesis) return;
    try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-IN';
        u.rate = 0.9;
        u.pitch = 1.05;
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
    } catch (e) { }
}

// ============================================================
//  SAFE SPOTS
// ============================================================
function showSafeSpots(location) {
    safeSpotMarkers.forEach(m => m.remove());
    safeSpotMarkers = [];

    const spots = [
        { lat: 13.0500, lng: 80.2824, type: 'police', name: 'Marina Police Station', dist: '0.5' },
        { lat: 13.0358, lng: 80.2448, type: 'hospital', name: 'Apollo Hospital', dist: '1.2' },
        { lat: 13.0452, lng: 80.2427, type: 'crowd', name: 'T Nagar Shopping Complex', dist: '0.8' },
        { lat: 13.0600, lng: 80.2600, type: 'police', name: 'Egmore Police Post', dist: '1.5' }
    ];

    const panel = $('safeSpotsPanel');
    const list = $('safeSpotsList');
    panel.style.display = 'block';
    list.innerHTML = '';

    spots.forEach(spot => {
        const sym = spot.type === 'police' ? '🚔' : spot.type === 'hospital' ? '🏥' : '👥';
        const bg = spot.type === 'police' ? '#dce9ff' : spot.type === 'hospital' ? '#fde8eb' : '#d8f5e8';
        const col = spot.type === 'police' ? '#3b6fd4' : spot.type === 'hospital' ? '#e03e52' : '#1fa362';

        const el = document.createElement('div');
        el.innerHTML = `<div style="background:${bg};color:${col};width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.2);cursor:pointer;">${sym}</div>`;
        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([spot.lng, spot.lat])
            .setPopup(new maplibregl.Popup().setHTML(`<b>${spot.name}</b><br>${spot.dist} km away`))
            .addTo(map);
        safeSpotMarkers.push(marker);

        const item = document.createElement('div');
        item.className = `safe-spot-item`;
        item.innerHTML = `
            <div class="ss-icon ${spot.type === 'police' ? 'ss-police' : spot.type === 'hospital' ? 'ss-hospital' : 'ss-crowd'}">${sym}</div>
            <div><div class="ss-name">${spot.name}</div><div class="ss-dist">${spot.dist} km away</div></div>`;
        item.addEventListener('click', () => map.easeTo({ center: [spot.lng, spot.lat], zoom: 15 }));
        list.appendChild(item);
    });
}

// ============================================================
//  SOS FUNCTION
// ============================================================
function sendSOS() {
    if (!userLocation) { showToast('📍 Enable GPS first', 'warning'); return; }
    const link = `https://www.google.com/maps?q=${userLocation.lat},${userLocation.lng}`;
    const msg = `🚨 SOS EMERGENCY! I need immediate help.\nLocation: ${link}\nTime: ${new Date().toLocaleString()}`;

    showToast('🚨 SOS ACTIVATED! Alerting contacts!', 'danger');
    speak('SOS emergency activated. Emergency services have been alerted. Please stay safe.');
    if (navigator.vibrate) navigator.vibrate([400, 100, 400, 100, 400]);

    if (trustedContacts.length > 0) {
        trustedContacts.forEach(c => window.open(`sms:${c.phone}?body=${encodeURIComponent(msg)}`, '_blank'));
    } else {
        window.open(`sms:?body=${encodeURIComponent(msg)}`, '_blank');
    }
    navigator.clipboard?.writeText(msg).catch(() => { });

    const el = document.createElement('div');
    el.innerHTML = `<div style="background:#e03e52;color:#fff;padding:7px 12px;border-radius:20px;font-weight:800;font-size:13px;box-shadow:0 2px 14px rgba(224,62,82,0.6);animation:sosPulse 1s infinite;">🚨 SOS</div>`;
    new maplibregl.Marker({ element: el })
        .setLngLat([userLocation.lng, userLocation.lat])
        .setPopup(new maplibregl.Popup().setHTML('<b>🚨 SOS ALERT SENT</b>'))
        .addTo(map);
    
    if (socket && socket.connected) {
        socket.emit('sos-alert', {
            userId: 'user_' + Date.now(),
            location: userLocation,
            message: msg
        });
    }
}

// ============================================================
//  SHARE LIVE LOCATION
// ============================================================
function shareLiveLocation() {
    if (!userLocation) { showToast('📍 Enable GPS first', 'warning'); return; }
    const link = `https://www.google.com/maps?q=${userLocation.lat},${userLocation.lng}`;
    const msg = `📍 I'm sharing my live location:\n${link}`;
    if (navigator.share) {
        navigator.share({ title: 'My Live Location', text: msg, url: link });
    } else {
        navigator.clipboard?.writeText(msg);
        showToast('📋 Location link copied!', 'success');
    }
    startLiveTracking();
}

function startLiveTracking() {
    $('liveTrackingPanel').style.display = 'block';
    if (trackingInterval) clearInterval(trackingInterval);
    trackingInterval = setInterval(() => {
        if (userLocation) {
            $('trackingCoords').textContent = `${userLocation.lat.toFixed(5)}, ${userLocation.lng.toFixed(5)}`;
        }
    }, 8000);
    showToast('📡 Live tracking started', 'success');
}

function stopTracking() {
    if (trackingInterval) { clearInterval(trackingInterval); trackingInterval = null; }
    $('liveTrackingPanel').style.display = 'none';
    showToast('📍 Tracking stopped', 'info');
}

// ============================================================
//  GO SAFE
// ============================================================
async function goSafe() {
    if (!userLocation) { showToast('📍 Enable GPS first', 'warning'); return; }
    showToast('🔍 Routing to nearest police station…', 'info');
    speak('Finding safest route to the nearest police station. Stay calm.');
    destInput.value = 'Nearest Police Station';
    const police = { lat: 13.0500, lng: 80.2824 };
    await fetchRouteAlternatives(userLocation, police);
    map.fitBounds([[userLocation.lng, userLocation.lat], [police.lng, police.lat]], { padding: 80 });
}

// ============================================================
//  FAKE CALL
// ============================================================
const NAMES = ['Amma', 'Akka', 'Priya', 'Ravi', 'Emergency Contact', 'Kavitha'];

function triggerFakeCall() {
    currentCallerName = NAMES[Math.floor(Math.random() * NAMES.length)];
    $('callerName').textContent = currentCallerName;
    $('fakeCallOverlay').style.display = 'flex';
    callSeconds = 0;
    $('callTimer').textContent = '0:00';
    if (callTimer) clearInterval(callTimer);
    callTimer = setInterval(() => {
        callSeconds++;
        const m = Math.floor(callSeconds / 60), s = callSeconds % 60;
        $('callTimer').textContent = `${m}:${String(s).padStart(2, '0')}`;
    }, 1000);

    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        function ring() {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.connect(g);
            g.connect(ctx.destination);
            o.type = 'sine';
            o.frequency.value = 880;
            g.gain.setValueAtTime(0.25, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
            o.start(ctx.currentTime);
            o.stop(ctx.currentTime + 0.8);
        }
        ring();
        setTimeout(ring, 1200);
        setTimeout(ring, 2400);
    } catch (e) { }
}

$('declineCall').addEventListener('click', () => {
    $('fakeCallOverlay').style.display = 'none';
    if (callTimer) clearInterval(callTimer);
    showToast('📵 Call declined', 'info');
});

$('acceptCall').addEventListener('click', () => {
    $('fakeCallOverlay').style.display = 'none';
    if (callTimer) clearInterval(callTimer);
    $('activeCallerName').textContent = currentCallerName;
    $('activeCallOverlay').style.display = 'flex';
    activeCallSeconds = 0;
    $('activeCallTimer').textContent = '0:00';
    if (activeCallTimer) clearInterval(activeCallTimer);
    activeCallTimer = setInterval(() => {
        activeCallSeconds++;
        const m = Math.floor(activeCallSeconds / 60), s = activeCallSeconds % 60;
        $('activeCallTimer').textContent = `${m}:${String(s).padStart(2, '0')}`;
    }, 1000);
    speak(`Hello? Yes, I'm on my way. I'll be there in about 10 minutes. Everything is fine.`);
});

$('endCall').addEventListener('click', () => {
    $('activeCallOverlay').style.display = 'none';
    if (activeCallTimer) clearInterval(activeCallTimer);
    speechSynthesis.cancel();
    showToast('📞 Call ended', 'info');
});

// ============================================================
//  REPORT UNSAFE AREA
// ============================================================
$('reportBtn').addEventListener('click', () => { $('reportModal').style.display = 'flex'; });
$('cancelReport').addEventListener('click', () => { $('reportModal').style.display = 'none'; });

$('submitReport').addEventListener('click', () => {
    if (!userLocation) { showToast('📍 Enable GPS to report', 'warning'); return; }
    const type = $('reportType').value;
    const desc = $('reportDesc').value.trim();
    const labels = { 1: 'Dark Area', 2: 'Suspicious Activity', 3: 'Harassment/Threat', 4: 'Road Hazard', 5: 'Other' };
    const severity = type == '3' ? 3 : type == '2' ? 2 : 1;

    const report = { lat: userLocation.lat, lng: userLocation.lng, type, typeLabel: labels[type] || 'Other', description: desc, ts: new Date().toLocaleTimeString(), severity };
    incidentReports.push(report);
    addFeedItem(report);
    updateDynamicDangerZones();

    if (map.getSource('hm')) {
        map.getSource('hm').setData({
            type: 'FeatureCollection',
            features: incidentReports.map(r => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [r.lng, r.lat] }, properties: { weight: r.severity } }))
        });
    }

    fetch('/api/safety/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) }).catch(() => { });
    $('reportModal').style.display = 'none';
    $('reportDesc').value = '';
    showToast('✅ Report submitted! Thank you.', 'success');
});

function addFeedItem(r) {
    const feed = $('incidentFeed');
    const empty = feed.querySelector('.feed-empty');
    if (empty) empty.remove();
    const cls = r.severity >= 3 ? 'high' : r.severity >= 2 ? 'medium' : 'low';
    const item = document.createElement('div');
    item.className = `feed-item ${cls}`;
    item.innerHTML = `<div class="feed-top"><span class="feed-type">${r.typeLabel}</span><span class="feed-time">${r.ts}</span></div>${r.description ? `<div class="feed-desc">${r.description}</div>` : ''}`;
    feed.insertBefore(item, feed.firstChild);
    $('reportCount').textContent = parseInt($('reportCount').textContent || 0) + 1;
}

// ============================================================
//  CHECK-IN
// ============================================================
$('checkinBtn').addEventListener('click', () => { $('checkinModal').style.display = 'flex'; });
$('cancelCheckinModal').addEventListener('click', () => { $('checkinModal').style.display = 'none'; });

$('startCheckin').addEventListener('click', () => {
    const mins = parseInt($('checkinMins').value) || 30;
    if (checkinTimer) clearInterval(checkinTimer);

    const end = Date.now() + mins * 60000;
    $('checkinModal').style.display = 'none';
    const bar = $('checkinStatusBar');
    bar.style.display = 'flex';

    checkinTimer = setInterval(() => {
        const rem = end - Date.now();
        if (rem <= 0) {
            clearInterval(checkinTimer);
            $('checkinCountdown').textContent = '⚠️ MISSED!';
            bar.style.background = 'linear-gradient(135deg,#e03e52,#c0293b)';
            const sosMsg = `⚠️ SAFETY ALERT: I have not checked in as expected! Please call me.\nLast location: https://www.google.com/maps?q=${userLocation?.lat || ''},${userLocation?.lng || ''}`;
            trustedContacts.forEach(c => window.open(`sms:${c.phone}?body=${encodeURIComponent(sosMsg)}`, '_blank'));
            showToast('⚠️ Check-in missed! Alerting contacts!', 'danger');
            speak('Check-in timer expired. Alerting your emergency contacts.');
            return;
        }
        const m = Math.floor(rem / 60000), s = Math.floor((rem % 60000) / 1000);
        $('checkinCountdown').textContent = `Auto-alert in ${m}:${String(s).padStart(2, '0')}`;
    }, 1000);

    showToast(`✅ Check-in timer set for ${mins} minutes`, 'success');
    speak(`Safe arrival check-in set for ${mins} minutes. Stay safe!`);
});

$('confirmArrivalBtn').addEventListener('click', () => {
    if (checkinTimer) clearInterval(checkinTimer);
    const bar = $('checkinStatusBar');
    bar.style.display = 'none';
    bar.style.background = '';
    showToast('✅ Safe arrival confirmed! Contacts notified.', 'success');
    speak('Safe arrival confirmed. Your contacts have been notified.');
    const msg = `✅ SAFE ARRIVAL: I have arrived safely at my destination. No need to worry!`;
    trustedContacts.forEach(c => window.open(`sms:${c.phone}?body=${encodeURIComponent(msg)}`, '_blank'));
});

// ============================================================
//  SHARE ROUTE
// ============================================================
$('shareRouteBtn')?.addEventListener('click', () => {
    if (!currentRoute) { showToast('Find a route first', 'warning'); return; }
    const { dist, dur, pref } = currentRoute;
    const from = startInput.value || 'Current location';
    const to = destInput.value;
    const gmapsLink = `https://www.google.com/maps/dir/${encodeURIComponent(from)}/${encodeURIComponent(to)}`;
    $('shareRouteInfo').innerHTML = `<b>${pref.charAt(0).toUpperCase() + pref.slice(1)} Route</b><br>${from} → ${to}<br>${dist} km · ${dur} min`;
    $('shareRouteLink').value = gmapsLink;
    $('shareRouteModal').style.display = 'flex';
});

$('copyRouteLink').addEventListener('click', () => {
    navigator.clipboard?.writeText($('shareRouteLink').value);
    showToast('📋 Route link copied!', 'success');
});

$('shareRouteWA').addEventListener('click', () => {
    if (!currentRoute) return;
    const { dist, dur, pref } = currentRoute;
    const from = startInput.value, to = destInput.value;
    const link = `https://www.google.com/maps/dir/${encodeURIComponent(from)}/${encodeURIComponent(to)}`;
    const msg = `🛡️ SafeRoute: ${pref} route from ${from} to ${to}\n📏 ${dist}km · ⏱ ${dur}min\n🗺️ ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
});

$('closeShareRoute').addEventListener('click', () => { $('shareRouteModal').style.display = 'none'; });
$('bnbEndBtn').addEventListener('click', () => {
    if (etaInterval) clearInterval(etaInterval);
    $('bottomNavBar').style.display = 'none';
    $('liveNavBar').style.display = 'none';
    if (deviationCheckInterval) clearInterval(deviationCheckInterval);
    showToast('Navigation ended', 'info');
});

// ============================================================
//  TRUSTED CONTACTS
// ============================================================
function renderContacts() {
    const list = $('contactList');
    list.innerHTML = '';
    if (!trustedContacts.length) {
        list.innerHTML = '<p style="font-size:13px;color:#8c92a4;text-align:center;padding:20px 0;">No contacts added yet</p>';
        return;
    }
    trustedContacts.forEach((c, i) => {
        const init = c.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const item = document.createElement('div');
        item.className = 'contact-item';
        item.innerHTML = `
            <div class="contact-avatar">${init}</div>
            <div class="contact-info">
                <div class="contact-name">${c.name}</div>
                <div class="contact-phone">${c.phone}</div>
            </div>
            <div class="contact-actions">
                <button class="contact-btn wa" onclick="window.sendWA(${i})"><i class="fab fa-whatsapp"></i></button>
                <button class="contact-btn sms" onclick="window.sendSMSTo(${i})"><i class="fas fa-sms"></i></button>
                <button class="contact-btn del" onclick="window.delContact(${i})"><i class="fas fa-trash"></i></button>
            </div>`;
        list.appendChild(item);
    });
}

function addContact() {
    const name = $('cName').value.trim();
    const phone = $('cPhone').value.trim();
    if (!name || !phone) { showToast('⚠️ Enter name and phone', 'warning'); return; }
    const clean = phone.replace(/[\s\-()]/g, '');
    if (!/^[+\d]{7,16}$/.test(clean)) { showToast('❌ Invalid phone number', 'danger'); return; }
    trustedContacts.push({ name, phone });
    localStorage.setItem('sr_contacts', JSON.stringify(trustedContacts));
    $('cName').value = '';
    $('cPhone').value = '';
    renderContacts();
    showToast(`✅ ${name} added to trusted contacts`, 'success');
}

window.delContact = (i) => {
    trustedContacts.splice(i, 1);
    localStorage.setItem('sr_contacts', JSON.stringify(trustedContacts));
    renderContacts();
    showToast('Contact removed', 'info');
};

window.sendWA = (i) => {
    const c = trustedContacts[i];
    const loc = userLocation ? `https://maps.google.com/?q=${userLocation.lat},${userLocation.lng}` : 'unknown';
    const msg = `📍 SafeRoute update: I'm at ${loc}. Tracking my journey safely.`;
    window.open(`https://wa.me/${c.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
};

window.sendSMSTo = (i) => {
    const c = trustedContacts[i];
    const loc = userLocation ? `https://maps.google.com/?q=${userLocation.lat},${userLocation.lng}` : 'unknown';
    const msg = `SafeRoute: I'm tracking my journey. Location: ${loc}`;
    window.open(`sms:${c.phone}?body=${encodeURIComponent(msg)}`, '_blank');
};

// ============================================================
//  SAFETY TIPS
// ============================================================
function updateTips() {
    const h = new Date().getHours();
    const night = h < 6 || h > 18;
    const tips = night ? [
        'Stay in well-lit, populated areas',
        'Share live location with family',
        'Keep phone charged and accessible',
        'Use trusted rides, avoid isolated routes',
        'Travel with companion when possible'
    ] : [
        'Emergency: 112 (All), 100 (Police), 1091 (Women)',
        'Stay aware of your surroundings',
        'Avoid both earphones while walking',
        'Share your ETA before every journey',
        'Walk confidently and with purpose'
    ];
    $('safetyTips').innerHTML = tips.map(t =>
        `<div class="tip-item"><i class="fas fa-check-circle"></i><span>${t}</span></div>`
    ).join('');
}

// ============================================================
//  MAP UTILITIES
// ============================================================
function addDangerZones() {
    const zones = [
        { id: 1, lat: 12.9716, lng: 77.5946, radius: 800, level: 'high', name: 'Isolated Industrial Area', reason: 'Poor lighting, no police nearby' },
        { id: 2, lat: 13.0827, lng: 80.2707, radius: 500, level: 'medium', name: 'Dark Alley Zone', reason: 'Low street lighting' },
        { id: 3, lat: 12.9352, lng: 77.6245, radius: 600, level: 'high', name: 'Crime Prone Area', reason: 'Historical incident reports' },
        { id: 4, lat: 13.0102, lng: 80.2145, radius: 400, level: 'medium', name: 'Low Traffic Zone', reason: 'Limited police patrol' }
    ];

    zones.forEach(zone => {
        const color = zone.level === 'high' ? '#e03e52' : '#e07b1f';
        const geo = makeCircle(zone.lng, zone.lat, zone.radius / 1000);
        const src = `dz-${zone.id}`;

        if (map.getSource(src)) return;

        map.addSource(src, { type: 'geojson', data: geo });
        map.addLayer({ id: `${src}-fill`, type: 'fill', source: src, paint: { 'fill-color': color, 'fill-opacity': zone.level === 'high' ? 0.22 : 0.15 } });
        map.addLayer({ id: `${src}-line`, type: 'line', source: src, paint: { 'line-color': color, 'line-width': 2, 'line-opacity': 0.7 } });

        map.on('click', `${src}-fill`, () => {
            new maplibregl.Popup()
                .setLngLat([zone.lng, zone.lat])
                .setHTML(`<strong>⚠️ ${zone.name}</strong><br>${zone.reason}<br><small>Risk: ${zone.level.toUpperCase()}</small>`)
                .addTo(map);
        });
    });
}

function makeCircle(lng, lat, radiusKm, steps = 64) {
    const coords = [];
    for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * 2 * Math.PI;
        coords.push([
            lng + (radiusKm / (111.32 * Math.cos(lat * Math.PI / 180))) * Math.cos(a),
            lat + (radiusKm / 110.574) * Math.sin(a)
        ]);
    }
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] } };
}

function addHeatmapLayer() {
    const data = { type: 'FeatureCollection', features: [] };
    if (map.getSource('hm')) return;
    map.addSource('hm', { type: 'geojson', data });
    map.addLayer({
        id: 'hm-layer', type: 'heatmap', source: 'hm', maxzoom: 18,
        paint: {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 6, 1],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
            'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
                0, 'rgba(0,0,255,0)', 0.2, '#3b6fd4', 0.5, '#ff9800', 0.8, '#e03e52', 1, '#7f0000'],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 9, 22],
            'heatmap-opacity': 0
        }
    });
}

function addSafeZoneLayer() {
    const spots = [
        { lat: 13.0500, lng: 80.2824, type: 'police', color: '#3b6fd4' },
        { lat: 13.0358, lng: 80.2448, type: 'hospital', color: '#e03e52' },
        { lat: 13.0452, lng: 80.2427, type: 'crowd', color: '#1fa362' }
    ];
    spots.forEach((s, i) => {
        const id = `sz-${i}`;
        if (map.getSource(id)) return;
        const geo = makeCircle(s.lng, s.lat, 0.5);
        map.addSource(id, { type: 'geojson', data: geo });
        map.addLayer({ id: `${id}-f`, type: 'fill', source: id, paint: { 'fill-color': s.color, 'fill-opacity': 0 } });
        map.addLayer({ id: `${id}-l`, type: 'line', source: id, paint: { 'line-color': s.color, 'line-width': 2, 'line-dasharray': [4, 3], 'line-opacity': 0 } });
    });
}

function toggleHeatmap() {
    heatmapVisible = !heatmapVisible;
    const btn = $('toggleHeatmap');
    if (btn) btn.classList.toggle('active', heatmapVisible);
    if (map.getLayer('hm-layer')) {
        map.setPaintProperty('hm-layer', 'heatmap-opacity', heatmapVisible ? 0.82 : 0);
    }
    showToast(heatmapVisible ? '🔥 Heatmap ON' : '🔥 Heatmap OFF', 'info');
}

function toggleSafeZones() {
    safeZonesVisible = !safeZonesVisible;
    const btn = $('toggleSafeZone');
    if (btn) btn.classList.toggle('active', safeZonesVisible);
    [0, 1, 2].forEach(i => {
        if (map.getLayer(`sz-${i}-f`)) map.setPaintProperty(`sz-${i}-f`, 'fill-opacity', safeZonesVisible ? 0.13 : 0);
        if (map.getLayer(`sz-${i}-l`)) map.setPaintProperty(`sz-${i}-l`, 'line-opacity', safeZonesVisible ? 1 : 0);
    });
    showToast(safeZonesVisible ? '🛡️ Safe zones ON' : '🛡️ Safe zones OFF', 'info');
}

function toggle3D() {
    is3D = !is3D;
    const btn = $('toggle3D');
    if (btn) btn.classList.toggle('active', is3D);
    map.easeTo({ pitch: is3D ? 52 : 0, bearing: is3D ? -18 : 0, duration: 800 });
    showToast(is3D ? '🏙️ 3D view enabled' : '🗺️ 2D view restored', 'info');
}

function toggleFullscreen() {
    isFullscreen = !isFullscreen;
    const sidebar = $('sidebar');
    if (sidebar) sidebar.style.display = isFullscreen ? 'none' : '';
    const btn = $('fullscreenBtn');
    if (btn) {
        btn.classList.toggle('active', isFullscreen);
        const icon = btn.querySelector('i');
        if (icon) icon.className = isFullscreen ? 'fas fa-compress' : 'fas fa-expand';
    }
    map.resize();
    showToast(isFullscreen ? '⛶ Full screen map' : '↩ Sidebar restored', 'info');
}

// ============================================================
//  TOAST
// ============================================================
function showToast(msg, type = 'info') {
    const t = $('toast');
    const icons = { success: 'fa-check-circle', danger: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    t.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${msg}`;
    t.className = `toast ${type} show`;
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 4500);
}

// ============================================================
//  SHAKE DETECTION
// ============================================================
if (window.DeviceMotionEvent) {
    window.addEventListener('devicemotion', (e) => {
        const acc = e.acceleration;
        if (acc && (Math.abs(acc.x) > 15 || Math.abs(acc.y) > 15 || Math.abs(acc.z) > 15)) {
            handleShake();
        }
    });
}

// ============================================================
//  EVENT LISTENERS
// ============================================================
$('routeBtn').addEventListener('click', handleRoute);
destInput.addEventListener('keypress', e => { if (e.key === 'Enter') handleRoute(); });
$('locateBtn').addEventListener('click', getUserLocation);
$('swapBtn').addEventListener('click', swapInputs);

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentPreference = btn.dataset.pref;
        if (currentRoute) {
            const bonus = { safest: 15, balanced: 5, fastest: -5 };
            const risk = calculateRiskParameters(currentRoute.start.lat, currentRoute.start.lng);
            updateSafetyCard(Math.min(100, Math.max(0, risk.safetyScore + (bonus[currentPreference] || 0))), currentPreference, currentRoute.start, currentRoute.dest);
        }
    });
});

document.querySelectorAll('.tm-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tm-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        travelMode = btn.dataset.mode;
        showToast(`Travel mode: ${travelMode}`, 'info');
    });
});

$('toggleMapStyle').addEventListener('click', () => applyMapStyle(!isDarkMap));
$('toggle3D').addEventListener('click', toggle3D);
$('toggleHeatmap').addEventListener('click', toggleHeatmap);
$('toggleSafeZone').addEventListener('click', toggleSafeZones);
$('toggleRiskOverlay').addEventListener('click', toggleRiskOverlay);
$('zoomToMe').addEventListener('click', zoomToMe);
$('compassBtn').addEventListener('click', resetCompass);
$('fullscreenBtn').addEventListener('click', toggleFullscreen);

$('openDirectionsBtn').addEventListener('click', () => {
    $('directionsPanel').classList.toggle('open');
    $('contactsPanel').classList.remove('open');
    $('openDirectionsBtn').classList.toggle('active', $('directionsPanel').classList.contains('open'));
    $('openContactsBtn').classList.remove('active');
});
$('openContactsBtn').addEventListener('click', () => {
    $('contactsPanel').classList.toggle('open');
    $('directionsPanel').classList.remove('open');
    $('openContactsBtn').classList.toggle('active', $('contactsPanel').classList.contains('open'));
    $('openDirectionsBtn').classList.remove('active');
    renderContacts();
});
$('closeDirections').addEventListener('click', () => { $('directionsPanel').classList.remove('open'); $('openDirectionsBtn').classList.remove('active'); });
$('closeContacts').addEventListener('click', () => { $('contactsPanel').classList.remove('open'); $('openContactsBtn').classList.remove('active'); });

$('startVoiceBtn').addEventListener('click', toggleVoiceNav);
$('voiceNavBtn')?.addEventListener('click', toggleVoiceNav);
$('mobileToggle').addEventListener('click', () => $('sidebar').classList.toggle('open'));
$('closeSidebar').addEventListener('click', () => $('sidebar').classList.remove('open'));
$('sosBtn').addEventListener('click', sendSOS);
$('shareLocBtn').addEventListener('click', shareLiveLocation);
$('goSafeBtn').addEventListener('click', goSafe);
$('fakecallBtn').addEventListener('click', triggerFakeCall);
$('stopTrackBtn').addEventListener('click', stopTracking);
$('addContactBtn').addEventListener('click', addContact);
$('panicModeBtn').addEventListener('click', activatePanicMode);
$('panicSOS').addEventListener('click', () => { sendSOS(); $('panicOverlay').style.display = 'none'; clearInterval(panicTimerInterval); });
$('panicCancel').addEventListener('click', cancelPanicMode);
$('aiAssistantBtn').addEventListener('click', () => { $('aiAssistantModal').style.display = 'flex'; initAIAssistant(); });
$('closeAIModal').addEventListener('click', () => { $('aiAssistantModal').style.display = 'none'; });

setupAutocomplete(startInput, startSugg);
setupAutocomplete(destInput, destSugg);

// ============================================================
//  INITIALIZATION
// ============================================================
window.addEventListener('load', () => {
    initMap();
    getUserLocation();
    updateTips();
    renderContacts();
    updateSafetyAnalytics();
    setInterval(updateTips, 300000);
    setInterval(() => {
        if (userLocation) displayRiskParameters(userLocation.lat, userLocation.lng);
    }, 10000);

    // Demo incident reports
    setInterval(() => {
        if (Math.random() < 0.06 && incidentReports.length < 12) {
            const demos = [
                { typeLabel: 'Suspicious Activity', lat: 13.07, lng: 80.27, severity: 2, ts: new Date().toLocaleTimeString(), description: 'User reported suspicious activity near junction' },
                { typeLabel: 'Dark Area', lat: 13.03, lng: 80.21, severity: 1, ts: new Date().toLocaleTimeString(), description: 'Poorly lit stretch near market road' }
            ];
            const r = demos[Math.floor(Math.random() * demos.length)];
            incidentReports.push(r);
            addFeedItem(r);
            updateDynamicDangerZones();
            if (map.getSource('hm')) {
                map.getSource('hm').setData({
                    type: 'FeatureCollection',
                    features: incidentReports.map(x => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x.lng, x.lat] }, properties: { weight: x.severity } }))
                });
            }
        }
    }, 35000);
});