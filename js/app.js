// ── CONFIG ──
let GEMINI_API_KEY = localStorage.getItem('civicLensKey') || '';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// ── STATE ──
let issues = JSON.parse(localStorage.getItem('civicIssues') || '[]');
let currentPhotoBase64 = null;
let currentSeverity = '';
let map = null;
let mapMarkers = [];

const CATEGORY_ICONS = {
  'Pothole': '🕳️', 'Water Leakage': '💧', 'Broken Streetlight': '💡',
  'Garbage': '🗑️', 'Damaged Road': '🚧', 'Other': '📌',
};

const SEVERITY_COLORS = {
  'Low': '#00c48c', 'Medium': '#ffd700', 'High': '#ff8c42', 'Critical': '#ff4757'
};

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  updateStats();
  if (!GEMINI_API_KEY) {
    document.getElementById('apiModal').classList.remove('hidden');
  }
});

// Google Maps callback
function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 20.5937, lng: 78.9629 }, // India center
    zoom: 5,
    styles: [
      { elementType: 'geometry', stylers: [{ color: '#1a1f2e' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#7a8099' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1f2e' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a3040' }] },
      { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a1f2e' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1117' }] },
      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    ]
  });

  // Try to center on user location
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      map.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      map.setZoom(13);
    });
  }

  renderMapMarkers();
}

// ── API KEY ──
function saveApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (key) { GEMINI_API_KEY = key; localStorage.setItem('civicLensKey', key); }
  closeModal();
}
function closeModal() { document.getElementById('apiModal').classList.add('hidden'); }

// ── NAVIGATION ──
function showSection(name, btn) {
  ['section-report', 'section-map', 'section-dashboard'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById('hero').classList.add('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  if (name === 'report') {
    document.getElementById('hero').classList.remove('hidden');
    document.getElementById('section-report').classList.remove('hidden');
  } else if (name === 'map') {
    document.getElementById('section-map').classList.remove('hidden');
    if (map) { renderMapMarkers(); google.maps.event.trigger(map, 'resize'); }
  } else if (name === 'dashboard') {
    document.getElementById('section-dashboard').classList.remove('hidden');
    renderDashboard();
  }
}

// ── MAP MARKERS ──
function renderMapMarkers() {
  if (!map) return;
  mapMarkers.forEach(m => m.setMap(null));
  mapMarkers = [];

  const infoWindow = new google.maps.InfoWindow();

  issues.forEach(issue => {
    if (!issue.lat || !issue.lng) return;
    const lat = parseFloat(issue.lat);
    const lng = parseFloat(issue.lng);
    if (isNaN(lat) || isNaN(lng)) return;

    const marker = new google.maps.Marker({
      position: { lat, lng },
      map,
      title: issue.title,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 12,
        fillColor: SEVERITY_COLORS[issue.severity] || '#00e5ff',
        fillOpacity: 0.9,
        strokeColor: '#fff',
        strokeWeight: 2,
      }
    });

    marker.addListener('click', () => {
      infoWindow.setContent(`
        <div style="background:#1e2330;color:#e8eaf0;padding:12px;border-radius:10px;min-width:200px;font-family:Inter,sans-serif">
          <div style="font-size:1.2rem;margin-bottom:4px">${CATEGORY_ICONS[issue.category] || '📌'}</div>
          <div style="font-weight:600;margin-bottom:4px">${issue.title}</div>
          <div style="font-size:0.8rem;color:#7a8099;margin-bottom:8px">📍 ${issue.location}</div>
          <div style="font-size:0.8rem;margin-bottom:4px">${issue.description}</div>
          <div style="display:flex;gap:6px;margin-top:8px">
            <span style="background:${SEVERITY_COLORS[issue.severity]}22;color:${SEVERITY_COLORS[issue.severity]};padding:2px 8px;border-radius:99px;font-size:0.75rem;font-weight:600">${issue.severity}</span>
            <span style="background:#2a304044;color:#7a8099;padding:2px 8px;border-radius:99px;font-size:0.75rem">${issue.status}</span>
          </div>
        </div>
      `);
      infoWindow.open(map, marker);
    });

    mapMarkers.push(marker);
  });

  // Fit map to markers
  if (mapMarkers.length > 0) {
    const bounds = new google.maps.LatLngBounds();
    mapMarkers.forEach(m => bounds.extend(m.getPosition()));
    map.fitBounds(bounds);
    if (mapMarkers.length === 1) map.setZoom(15);
  }
}

// ── PHOTO UPLOAD ──
function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    currentPhotoBase64 = dataUrl.split(',')[1];
    document.getElementById('uploadZone').classList.add('hidden');
    document.getElementById('previewWrap').classList.remove('hidden');
    document.getElementById('photoPreview').src = dataUrl;
    analyzeWithGemini(currentPhotoBase64);
  };
  reader.readAsDataURL(file);
}

function resetPhoto() {
  currentPhotoBase64 = null;
  document.getElementById('uploadZone').classList.remove('hidden');
  document.getElementById('previewWrap').classList.add('hidden');
  document.getElementById('aiStatus').classList.add('hidden');
  document.getElementById('aiResult').classList.add('hidden');
  document.getElementById('photoInput').value = '';
}

// ── GEMINI AI ──
async function analyzeWithGemini(base64Image) {
  document.getElementById('aiStatus').classList.remove('hidden');
  document.getElementById('aiResult').classList.add('hidden');

  if (!GEMINI_API_KEY) {
    setTimeout(() => fillAIResult({
      category: 'Pothole', severity: 'High',
      description: 'A large pothole approximately 40cm wide detected on the road surface.',
      action: 'Notify municipal road maintenance department immediately.'
    }), 1500);
    return;
  }

  const prompt = `You are a civic issue analysis AI. Analyze this image and identify community infrastructure problems.
Respond ONLY in this exact JSON format (no markdown, no extra text):
{"category":"Pothole|Water Leakage|Broken Streetlight|Garbage|Damaged Road|Other","severity":"Low|Medium|High|Critical","description":"One clear sentence describing the issue","action":"One sentence recommended action for municipal authorities"}`;

  try {
    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
          { text: prompt }
        ]}],
        generationConfig: { temperature: 0.1, maxOutputTokens: 300 }
      })
    });
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const result = JSON.parse(text.replace(/```json|```/g, '').trim());
    fillAIResult(result);
  } catch (err) {
    fillAIResult({ category: 'Other', severity: 'Medium',
      description: 'Issue detected. Please review and categorize manually.',
      action: 'Report to local municipal authority for assessment.' });
  }
}

function fillAIResult(result) {
  document.getElementById('aiStatus').classList.add('hidden');
  document.getElementById('aiResult').classList.remove('hidden');
  document.getElementById('aiCategory').textContent = `${CATEGORY_ICONS[result.category] || '📌'} ${result.category}`;
  document.getElementById('aiSeverity').textContent = result.severity;
  document.getElementById('aiSeverity').className = `ai-value severity-badge sev-${result.severity}`;
  document.getElementById('aiDescription').textContent = result.description;
  document.getElementById('aiAction').textContent = result.action;
  document.getElementById('issueCategory').value = result.category;
  document.getElementById('issueDesc').value = result.description;
  setSeverity(result.severity);
  if (!document.getElementById('issueTitle').value)
    document.getElementById('issueTitle').value = `${result.category} — needs attention`;
}

// ── SEVERITY ──
function setSeverity(level) {
  currentSeverity = level;
  document.getElementById('issueSeverity').value = level;
  document.querySelectorAll('.sev-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.sev-btn.${level.toLowerCase()}`);
  if (btn) btn.classList.add('active');
}

// ── GEOLOCATION ──
function getLocation() {
  if (!navigator.geolocation) return alert('Geolocation not supported');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      document.getElementById('issueLat').value = latitude;
      document.getElementById('issueLng').value = longitude;
      document.getElementById('issueLocation').value = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

      // Reverse geocode with Google Maps
      if (window.google) {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
          if (status === 'OK' && results[0]) {
            document.getElementById('issueLocation').value = results[0].formatted_address;
          }
        });
      }
    },
    () => alert('Could not get location. Please enter manually.')
  );
}

// ── SUBMIT ──
function submitIssue() {
  const title = document.getElementById('issueTitle').value.trim();
  const category = document.getElementById('issueCategory').value;
  const severity = document.getElementById('issueSeverity').value;
  const desc = document.getElementById('issueDesc').value.trim();
  const location = document.getElementById('issueLocation').value.trim();
  const reporter = document.getElementById('reporterName').value.trim() || 'Anonymous';

  if (!title) return showToast('Please enter an issue title', false);
  if (!category) return showToast('Please select a category', false);
  if (!severity) return showToast('Please select a severity level', false);

  const issue = {
    id: Date.now(), title, category, severity,
    description: desc, location: location || 'Location not specified',
    lat: document.getElementById('issueLat').value,
    lng: document.getElementById('issueLng').value,
    reporter, status: 'Reported',
    timestamp: new Date().toISOString(),
  };

  issues.unshift(issue);
  localStorage.setItem('civicIssues', JSON.stringify(issues));
  updateStats();
  resetForm();
  showToast('Issue reported & pinned on map! 🎉');
}

function resetForm() {
  ['issueTitle','issueDesc','issueLocation','reporterName'].forEach(id => document.getElementById(id).value = '');
  ['issueLat','issueLng','issueSeverity'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('issueCategory').value = '';
  document.querySelectorAll('.sev-btn').forEach(b => b.classList.remove('active'));
  currentSeverity = '';
  resetPhoto();
  document.getElementById('aiResult').classList.add('hidden');
}

// ── STATS ──
function updateStats() {
  const total = issues.length;
  const resolved = issues.filter(i => i.status === 'Resolved').length;
  const pending = issues.filter(i => i.status !== 'Resolved').length;
  const critical = issues.filter(i => i.severity === 'Critical').length;
  ['stat-total','dash-total'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent=total; });
  ['stat-resolved','dash-resolved'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent=resolved; });
  ['stat-pending','dash-pending'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent=pending; });
  const dc = document.getElementById('dash-critical'); if(dc) dc.textContent=critical;
}

// ── DASHBOARD ──
function renderDashboard() {
  updateStats();
  const container = document.getElementById('issuesTable');
  if (!container) return;
  if (issues.length === 0) {
    container.innerHTML = '<p style="color:var(--muted);padding:2rem;text-align:center">No issues yet. Go report one!</p>';
    return;
  }
  container.innerHTML = issues.map(issue => `
    <div class="table-row">
      <span class="table-cat-icon">${CATEGORY_ICONS[issue.category] || '📌'}</span>
      <div>
        <div class="table-title-text">${issue.title}</div>
        <div class="table-location">📍 ${issue.location} · by ${issue.reporter} · ${timeAgo(issue.timestamp)}</div>
      </div>
      <span class="table-sev sev-${issue.severity}">${issue.severity}</span>
      <span class="pin-status status-${issue.status.toLowerCase().replace(' ','-')}">${issue.status}</span>
      <select class="status-toggle" onchange="updateStatus(${issue.id}, this.value)">
        <option ${issue.status==='Reported'?'selected':''}>Reported</option>
        <option ${issue.status==='In Progress'?'selected':''}>In Progress</option>
        <option ${issue.status==='Resolved'?'selected':''}>Resolved</option>
      </select>
    </div>
  `).join('');
}

function updateStatus(id, newStatus) {
  const issue = issues.find(i => i.id === id);
  if (issue) {
    issue.status = newStatus;
    localStorage.setItem('civicIssues', JSON.stringify(issues));
    updateStats();
    renderDashboard();
    showToast(`Status updated to "${newStatus}"`);
  }
}

// ── HELPERS ──
function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds/60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds/3600)}h ago`;
  return `${Math.floor(seconds/86400)}d ago`;
}

function showToast(msg, success = true) {
  const toast = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  toast.querySelector('.toast-icon').textContent = success ? '✅' : '⚠️';
  toast.style.background = success ? 'var(--green)' : 'var(--orange)';
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}
