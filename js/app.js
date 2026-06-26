// ── CONFIG ──
let GEMINI_API_KEY = localStorage.getItem('civicLensKey') || '';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// ── STATE ──
let issues = JSON.parse(localStorage.getItem('civicIssues') || '[]');
let currentPhotoBase64 = null;
let currentSeverity = '';
let currentAIResult = null;
let currentChatIssueId = null;
let isChatLoading = false;
let map = null;
let mapMarkers = [];

const CATEGORY_ICONS = {
  'Pothole': '🕳️', 'Water Leakage': '💧', 'Broken Streetlight': '💡',
  'Garbage': '🗑️', 'Damaged Road': '🚧', 'Other': '📌',
};

const SEVERITY_COLORS = {
  'Low': '#5b7563', 'Medium': '#c8932e', 'High': '#bd6433', 'Critical': '#a93226'
};

// Fallback department routing if AI doesn't return one
const CATEGORY_DEPARTMENT = {
  'Pothole': 'Roads & Infrastructure',
  'Damaged Road': 'Roads & Infrastructure',
  'Water Leakage': 'Water Board',
  'Broken Streetlight': 'Electricity Board',
  'Garbage': 'Sanitation Department',
  'Other': 'General Municipal Office'
};

const SEVERITY_ORDER = ['Low', 'Medium', 'High', 'Critical'];

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
      { elementType: 'geometry', stylers: [{ color: '#f3ecde' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#6b6354' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#f3ecde' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#e3d8bf' }] },
      { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#d8cbb0' }] },
      { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#d8cbb0' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#bcd0cc' }] },
      { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#ece3cf' }] },
      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    ]
  });

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
  ['section-report', 'section-map', 'section-dashboard', 'section-leaderboard'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
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
  } else if (name === 'leaderboard') {
    document.getElementById('section-leaderboard').classList.remove('hidden');
    renderLeaderboard();
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
        scale: issue.reportCount > 1 ? 14 : 12,
        fillColor: SEVERITY_COLORS[issue.severity] || '#00e5ff',
        fillOpacity: 0.9,
        strokeColor: '#fff',
        strokeWeight: 2,
      }
    });

    marker.addListener('click', () => {
      infoWindow.setContent(`
        <div style="background:#fcf8ee;color:#241f18;padding:12px;border-radius:2px;min-width:200px;font-family:'IBM Plex Sans',sans-serif;border:1px solid #241f18">
          <div style="font-size:1.2rem;margin-bottom:4px">${CATEGORY_ICONS[issue.category] || '📌'}</div>
          <div style="font-weight:600;margin-bottom:4px;font-family:'Fraunces',serif">${issue.title}</div>
          <div style="font-size:0.78rem;color:#6b6354;margin-bottom:8px;font-family:'IBM Plex Mono',monospace">📍 ${issue.location}</div>
          <div style="font-size:0.8rem;margin-bottom:4px">${issue.description}</div>
          <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
            <span style="background:${SEVERITY_COLORS[issue.severity]}22;color:${SEVERITY_COLORS[issue.severity]};border:1px solid ${SEVERITY_COLORS[issue.severity]};padding:2px 8px;border-radius:2px;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;font-family:'IBM Plex Mono',monospace">${issue.severity}</span>
            <span style="background:#e3d8bf;color:#6b6354;padding:2px 8px;border-radius:2px;font-size:0.7rem;font-family:'IBM Plex Mono',monospace">${issue.status}</span>
            ${issue.reportCount > 1 ? `<span style="background:#2b4c53;color:#f3ecde;padding:2px 8px;border-radius:2px;font-size:0.7rem;font-weight:700;font-family:'IBM Plex Mono',monospace">👥 ${issue.reportCount} reports</span>` : ''}
          </div>
        </div>
      `);
      infoWindow.open(map, marker);
    });

    mapMarkers.push(marker);
  });

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

// ── GEMINI AI — AGENTIC DECISION CHAIN ──
async function analyzeWithGemini(base64Image) {
  document.getElementById('aiStatus').classList.remove('hidden');
  document.getElementById('aiResult').classList.add('hidden');

  if (!GEMINI_API_KEY) {
    setTimeout(() => fillAIResult({
      category: 'Pothole', severity: 'High',
      description: 'A large pothole approximately 40cm wide detected on the road surface.',
      action: 'Notify municipal road maintenance department immediately.',
      department: 'Roads & Infrastructure',
      severityReason: 'Large size poses vehicle damage and accident risk.',
      notificationDraft: 'Dear Roads & Infrastructure Dept, a large pothole (~40cm) has been reported on the road surface. Immediate repair is requested to prevent accidents.'
    }), 1500);
    return;
  }

  const prompt = `You are an autonomous civic-ops AI agent for a municipal issue reporting platform. Analyze this image and make a full chain of decisions a human civic officer would normally make manually:
1. Classify the issue type
2. Assess severity
3. Explain WHY that severity level was chosen (one short phrase, considering safety/risk)
4. Decide which municipal department should handle it
5. Draft a short, formal 2-sentence notification message addressed to that department

Respond ONLY in this exact JSON format (no markdown, no extra text):
{"category":"Pothole|Water Leakage|Broken Streetlight|Garbage|Damaged Road|Other","severity":"Low|Medium|High|Critical","description":"One clear sentence describing the issue","action":"One sentence recommended action for municipal authorities","department":"Roads & Infrastructure|Sanitation Department|Electricity Board|Water Board|General Municipal Office","severityReason":"One short phrase explaining why this severity level was chosen","notificationDraft":"A short formal 2-sentence notification addressed to the responsible department"}`;

  try {
    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
          { text: prompt }
        ]}],
        generationConfig: { temperature: 0.1, maxOutputTokens: 400 }
      })
    });
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const result = JSON.parse(text.replace(/```json|```/g, '').trim());
    fillAIResult(result);
  } catch (err) {
    fillAIResult({ category: 'Other', severity: 'Medium',
      description: 'Issue detected. Please review and categorize manually.',
      action: 'Report to local municipal authority for assessment.',
      department: 'General Municipal Office',
      severityReason: 'Default moderate priority due to inconclusive AI analysis.',
      notificationDraft: 'Dear Municipal Office, a community issue has been reported and requires manual review and categorization.' });
  }
}

function fillAIResult(result) {
  currentAIResult = result;
  document.getElementById('aiStatus').classList.add('hidden');
  document.getElementById('aiResult').classList.remove('hidden');
  document.getElementById('aiCategory').textContent = `${CATEGORY_ICONS[result.category] || '📌'} ${result.category}`;
  document.getElementById('aiSeverity').textContent = result.severity;
  document.getElementById('aiSeverity').className = `ai-value severity-badge sev-${result.severity}`;
  document.getElementById('aiDescription').textContent = result.description;
  document.getElementById('aiAction').textContent = result.action;

  const dept = result.department || CATEGORY_DEPARTMENT[result.category] || 'General Municipal Office';
  const deptEl = document.getElementById('aiDepartment');
  if (deptEl) deptEl.textContent = `🏛️ ${dept}`;
  const reasonEl = document.getElementById('aiReasoning');
  if (reasonEl) reasonEl.textContent = result.severityReason || '—';
  const draftEl = document.getElementById('aiDraft');
  if (draftEl) draftEl.textContent = result.notificationDraft || '—';

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

function escalateSeverity(sev) {
  const idx = SEVERITY_ORDER.indexOf(sev);
  if (idx === -1 || idx === SEVERITY_ORDER.length - 1) return sev;
  return SEVERITY_ORDER[idx + 1];
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

// ── DUPLICATE DETECTION (autonomous decision) ──
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findDuplicate(category, lat, lng) {
  if (isNaN(lat) || isNaN(lng)) return null;
  return issues.find(i => {
    if (i.category !== category) return false;
    if (i.status === 'Resolved') return false;
    const ilat = parseFloat(i.lat), ilng = parseFloat(i.lng);
    if (isNaN(ilat) || isNaN(ilng)) return false;
    return distanceMeters(lat, lng, ilat, ilng) <= 300;
  });
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

  const latVal = parseFloat(document.getElementById('issueLat').value);
  const lngVal = parseFloat(document.getElementById('issueLng').value);

  const dup = (!isNaN(latVal) && !isNaN(lngVal)) ? findDuplicate(category, latVal, lngVal) : null;

  if (dup) {
    dup.reportCount = (dup.reportCount || 1) + 1;
    dup.mergedReports = dup.mergedReports || [dup.reporter];
    if (!dup.mergedReports.includes(reporter)) dup.mergedReports.push(reporter);
    dup.timestamp = new Date().toISOString();

    let escalated = false;
    if (dup.reportCount % 3 === 0) {
      const next = escalateSeverity(dup.severity);
      if (next !== dup.severity) { dup.severity = next; escalated = true; }
    }

    localStorage.setItem('civicIssues', JSON.stringify(issues));
    updateStats();
    resetForm();
    showToast(escalated
      ? `🤖 AI merged this with an existing nearby report and escalated it to ${dup.severity} (${dup.reportCount} people reported it)!`
      : `🤖 AI matched this with an existing nearby report — merged (${dup.reportCount} reports total)`);
    if (map) renderMapMarkers();
    return;
  }

  const issue = {
    id: Date.now(), title, category, severity,
    description: desc, location: location || 'Location not specified',
    lat: document.getElementById('issueLat').value,
    lng: document.getElementById('issueLng').value,
    reporter, status: 'Reported',
    timestamp: new Date().toISOString(),
    department: (currentAIResult && currentAIResult.category === category && currentAIResult.department)
      ? currentAIResult.department : (CATEGORY_DEPARTMENT[category] || 'General Municipal Office'),
    severityReason: (currentAIResult && currentAIResult.category === category) ? (currentAIResult.severityReason || '') : '',
    notificationDraft: (currentAIResult && currentAIResult.category === category) ? (currentAIResult.notificationDraft || '') : '',
    reportCount: 1,
    mergedReports: [reporter],
    upvotes: 1,
    chatHistory: [],
    resolutionSummary: null,
  };

  issues.unshift(issue);
  localStorage.setItem('civicIssues', JSON.stringify(issues));
  updateStats();
  resetForm();
  showToast('Issue reported & pinned on map! 🎉');
  if (map) renderMapMarkers();
}

function resetForm() {
  ['issueTitle','issueDesc','issueLocation','reporterName'].forEach(id => document.getElementById(id).value = '');
  ['issueLat','issueLng','issueSeverity'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('issueCategory').value = '';
  document.querySelectorAll('.sev-btn').forEach(b => b.classList.remove('active'));
  currentSeverity = '';
  currentAIResult = null;
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
        <div class="table-title-text">${issue.title} ${issue.reportCount > 1 ? `<span class="dup-badge">👥 ${issue.reportCount}</span>` : ''}</div>
        <div class="table-location">📍 ${issue.location} · by ${issue.reporter} · ${timeAgo(issue.timestamp)}</div>
        ${issue.status === 'Resolved' && issue.resolutionSummary ? `<div class="resolution-summary">✅ ${issue.resolutionSummary}</div>` : ''}
      </div>
      <span class="table-sev sev-${issue.severity}">${issue.severity}</span>
      <span class="pin-status status-${issue.status.toLowerCase().replace(' ','-')}">${issue.status}</span>
      <div class="table-actions">
        <button class="btn-icon upvote-btn" onclick="upvoteIssue(${issue.id})" title="Upvote this issue">👍 ${issue.upvotes || 1}</button>
        <button class="btn-icon" onclick="openChat(${issue.id})" title="Ask AI about this issue">💬</button>
        <button class="btn-icon" onclick="openShareCard(${issue.id})" title="Share report card">📤</button>
      </div>
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
    if (newStatus === 'Resolved' && !issue.resolutionSummary) {
      generateResolutionSummary(issue);
    }
  }
}

function upvoteIssue(id) {
  const issue = issues.find(i => i.id === id);
  if (!issue) return;
  issue.upvotes = (issue.upvotes || 1) + 1;
  localStorage.setItem('civicIssues', JSON.stringify(issues));
  renderDashboard();
  showToast('👍 Upvoted!');
}

// ── AI RESOLUTION SUMMARY (Innovation) ──
async function generateResolutionSummary(issue) {
  issue.resolutionSummary = '⏳ Generating AI resolution summary...';
  renderDashboard();

  if (!GEMINI_API_KEY) {
    setTimeout(() => {
      issue.resolutionSummary = `${issue.category} issue resolved. ${issue.department || 'Municipal team'} completed the necessary repair work at ${issue.location}.`;
      localStorage.setItem('civicIssues', JSON.stringify(issues));
      renderDashboard();
    }, 1000);
    return;
  }

  const prompt = `Write a brief, realistic 1-2 sentence civic resolution summary for this now-resolved municipal issue, in the style of an official closure note:
Category: ${issue.category}
Description: ${issue.description}
Location: ${issue.location}
Department: ${issue.department || 'Municipal Office'}
Respond with ONLY the summary sentence(s), no extra text, no markdown.`;

  try {
    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 100 }
      })
    });
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    issue.resolutionSummary = text || `${issue.category} issue resolved by ${issue.department || 'municipal team'}.`;
  } catch (err) {
    issue.resolutionSummary = `${issue.category} issue resolved by ${issue.department || 'municipal team'}.`;
  }
  localStorage.setItem('civicIssues', JSON.stringify(issues));
  renderDashboard();
}

// ── GEMINI ISSUE CLUSTERING (Problem Solving) ──
async function findClusters() {
  if (issues.length < 2) {
    showToast('Need at least 2 reported issues to find clusters', false);
    return;
  }
  const panel = document.getElementById('clusterPanel');
  panel.classList.remove('hidden');
  panel.innerHTML = '<p class="cluster-loading">🤖 Analyzing issue patterns nearby...</p>';

  const issueSummaries = issues.map(i =>
    `- ${i.category} (${i.severity}) at "${i.location}" [lat:${i.lat || '?'}, lng:${i.lng || '?'}], status: ${i.status}`
  ).join('\n');

  if (!GEMINI_API_KEY) {
    setTimeout(() => {
      panel.innerHTML = `<div class="cluster-result">📍 Demo Mode: Based on reported locations, issues of the same category reported close together may indicate a priority zone needing municipal attention. Add your Gemini API key for live AI cluster analysis.</div>`;
    }, 1000);
    return;
  }

  const prompt = `You are a civic-ops AI analyzing a list of reported municipal issues. Identify any geographic or categorical clusters/patterns — e.g. multiple issues of the same type reported close together suggesting a "priority zone" for municipal attention. Be concise (3-5 sentences max). If no clear cluster exists, say so briefly.

Issues:
${issueSummaries}`;

  try {
    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 300 }
      })
    });
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'No clear pattern detected.';
    panel.innerHTML = `<div class="cluster-result">🧭 ${text}</div>`;
  } catch (err) {
    panel.innerHTML = `<div class="cluster-result">⚠️ Could not analyze patterns right now. Please try again.</div>`;
  }
}

// ── EXPORT REPORT (PDF, with AI executive summary) ──
async function exportReport() {
  if (issues.length === 0) {
    showToast('No issues to export yet', false);
    return;
  }
  showToast('Generating report...');

  let aiSummary = 'AI summary unavailable — no Gemini API key set.';
  if (GEMINI_API_KEY) {
    const issueSummaries = issues.map(i => `- ${i.category} (${i.severity}, ${i.status}) at ${i.location}`).join('\n');
    const prompt = `Write a brief 3-4 sentence executive summary for a municipal civic report, summarizing the overall state of reported community issues below. Mention totals, most common category, and overall urgency level. Respond with ONLY the summary text.

Issues:
${issueSummaries}`;
    try {
      const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 250 } })
      });
      const data = await response.json();
      aiSummary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || aiSummary;
    } catch (err) { /* keep fallback */ }
  }

  if (!window.jspdf) { showToast('PDF library not loaded', false); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 20;

  doc.setFontSize(18);
  doc.text('CivicLens — Community Issue Report', 14, y); y += 10;
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y); y += 10;

  doc.setFontSize(12);
  doc.text('AI Executive Summary:', 14, y); y += 7;
  doc.setFontSize(10);
  const summaryLines = doc.splitTextToSize(aiSummary, 180);
  doc.text(summaryLines, 14, y); y += summaryLines.length * 5 + 8;

  doc.setFontSize(12);
  doc.text(`Total Issues: ${issues.length}`, 14, y); y += 6;
  doc.text(`Resolved: ${issues.filter(i => i.status === 'Resolved').length}`, 14, y); y += 6;
  doc.text(`In Progress: ${issues.filter(i => i.status !== 'Resolved').length}`, 14, y); y += 6;
  doc.text(`Critical: ${issues.filter(i => i.severity === 'Critical').length}`, 14, y); y += 10;

  doc.setFontSize(12);
  doc.text('Issue Log:', 14, y); y += 7;
  doc.setFontSize(9);
  issues.forEach(issue => {
    if (y > 280) { doc.addPage(); y = 20; }
    const line = `${issue.category} | ${issue.severity} | ${issue.status} | ${issue.location} | by ${issue.reporter}`;
    const wrapped = doc.splitTextToSize(line, 180);
    doc.text(wrapped, 14, y);
    y += wrapped.length * 5 + 3;
  });

  doc.save('civiclens-report.pdf');
  showToast('Report downloaded! 📄');
}

// ── GEMINI FOLLOW-UP Q&A CHAT (Agentic Depth) ──
function openChat(id) {
  currentChatIssueId = id;
  const issue = issues.find(i => i.id === id);
  if (!issue) return;
  issue.chatHistory = issue.chatHistory || [];
  document.getElementById('chatIssueTitle').textContent = issue.title;
  renderChatMessages(issue);
  document.getElementById('chatModal').classList.remove('hidden');
}

function closeChatModal() {
  document.getElementById('chatModal').classList.add('hidden');
  currentChatIssueId = null;
}

function renderChatMessages(issue) {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  const history = issue.chatHistory || [];
  if (history.length === 0) {
    container.innerHTML = '<p class="chat-empty">Ask anything about this issue — e.g. "How long will this take?" or "Who should I contact?"</p>';
    return;
  }
  container.innerHTML = history.map(m => `
    <div class="chat-msg ${m.role}">
      <span class="chat-bubble">${m.text}</span>
    </div>
  `).join('');
  container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
  if (isChatLoading || !currentChatIssueId) return;
  const input = document.getElementById('chatInput');
  const question = input.value.trim();
  if (!question) return;
  const issue = issues.find(i => i.id === currentChatIssueId);
  if (!issue) return;

  issue.chatHistory = issue.chatHistory || [];
  issue.chatHistory.push({ role: 'user', text: question });
  input.value = '';
  renderChatMessages(issue);

  isChatLoading = true;
  const sendBtn = document.getElementById('chatSendBtn');
  if (sendBtn) sendBtn.disabled = true;

  const container = document.getElementById('chatMessages');
  const typingEl = document.createElement('div');
  typingEl.className = 'chat-msg model typing';
  typingEl.innerHTML = '<span class="chat-bubble">Gemini is typing...</span>';
  container.appendChild(typingEl);
  container.scrollTop = container.scrollHeight;

  const answer = await askGeminiFollowup(issue, question);
  issue.chatHistory.push({ role: 'model', text: answer });
  localStorage.setItem('civicIssues', JSON.stringify(issues));
  renderChatMessages(issue);

  isChatLoading = false;
  if (sendBtn) sendBtn.disabled = false;
}

async function askGeminiFollowup(issue, question) {
  if (!GEMINI_API_KEY) {
    const eta = { Critical: '24-48 hours', High: '3-5 days', Medium: '1-2 weeks', Low: '2-4 weeks' }[issue.severity] || 'a few days';
    return `This is a ${issue.severity} priority ${issue.category} issue. Based on its severity, it's typically resolved within ${eta} by the ${issue.department || 'municipal'} team. For direct updates, you can contact the ${issue.department || 'local municipal office'}.`;
  }

  const historyText = (issue.chatHistory || [])
    .slice(0, -1)
    .map(m => `${m.role === 'user' ? 'Citizen' : 'Assistant'}: ${m.text}`)
    .join('\n');

  const prompt = `You are a helpful civic assistant for a municipal issue-tracking platform called CivicLens. A citizen reported this issue:
Category: ${issue.category}
Severity: ${issue.severity}
Description: ${issue.description}
Status: ${issue.status}
Department responsible: ${issue.department || 'Municipal Office'}
Location: ${issue.location}

Conversation so far:
${historyText}

Citizen's new question: ${question}

Answer in 2-3 short, helpful sentences in a realistic civic-assistant tone. If asked about timelines, give a reasonable estimate based on severity (Critical: 24-48 hrs, High: 3-5 days, Medium: 1-2 weeks, Low: 2-4 weeks). If asked who to contact, refer to the responsible department. Respond with ONLY the answer text, no labels.`;

  try {
    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 200 }
      })
    });
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "I'm not sure — please contact the responsible department directly.";
  } catch (err) {
    return "I couldn't reach Gemini just now — please try again in a moment.";
  }
}

// ── LEADERBOARD ──
function computeLeaderboard() {
  const tally = {};
  issues.forEach(issue => {
    const names = (issue.mergedReports && issue.mergedReports.length) ? issue.mergedReports : [issue.reporter];
    names.forEach(name => {
      const key = name || 'Anonymous';
      tally[key] = (tally[key] || 0) + 1;
    });
  });
  return Object.entries(tally)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function renderLeaderboard() {
  const container = document.getElementById('leaderboardList');
  if (!container) return;
  const ranked = computeLeaderboard();
  if (ranked.length === 0) {
    container.innerHTML = '<p style="color:var(--muted);padding:2rem;text-align:center">No reports yet. Be the first Community Hero! 🦸</p>';
    return;
  }
  const medals = ['🥇', '🥈', '🥉'];
  container.innerHTML = ranked.slice(0, 10).map((entry, idx) => `
    <div class="leader-row">
      <span class="leader-rank">${medals[idx] || `#${idx + 1}`}</span>
      <span class="leader-name">${entry.name}</span>
      <span class="leader-count">${entry.count} report${entry.count !== 1 ? 's' : ''}</span>
    </div>
  `).join('');
}

// ── SHARE CARD ──
function openShareCard(id) {
  const issue = issues.find(i => i.id === id);
  if (!issue) return;
  const card = document.getElementById('shareCardContent');
  card.innerHTML = `
    <div class="share-card-icon">${CATEGORY_ICONS[issue.category] || '📌'}</div>
    <div class="share-card-cat">${issue.category}</div>
    <div class="share-card-title">${issue.title}</div>
    <div class="share-card-desc">${issue.description || ''}</div>
    <div class="share-card-meta">
      <span class="table-sev sev-${issue.severity}">${issue.severity}</span>
      <span class="pin-status status-${issue.status.toLowerCase().replace(' ','-')}">${issue.status}</span>
    </div>
    <div class="share-card-loc">📍 ${issue.location}</div>
    ${issue.reportCount > 1 ? `<div class="share-card-reports">👥 Confirmed by ${issue.reportCount} community members</div>` : ''}
    <div class="share-card-footer">Reported via CivicLens · Powered by Gemini AI</div>
  `;
  document.getElementById('shareModal').classList.remove('hidden');
}

function closeShareModal() { document.getElementById('shareModal').classList.add('hidden'); }

function downloadShareCard() {
  const card = document.getElementById('shareCardContent');
  if (!window.html2canvas) { showToast('Could not generate image', false); return; }
  html2canvas(card, { backgroundColor: '#161a23', scale: 2 }).then(canvas => {
    const link = document.createElement('a');
    link.download = 'civiclens-report-card.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
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
