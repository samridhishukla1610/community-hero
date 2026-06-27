// ── CONFIG ──
let GEMINI_API_KEY = localStorage.getItem('civicLensKey') || '';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// ── STATE ──
let issues = JSON.parse(localStorage.getItem('civicIssues') || '[]');
let currentPhotoBase64 = null;
let currentSeverity = '';
let currentAIResult = null;
let map = null;
let mapMarkers = [];
let chatHistories = JSON.parse(localStorage.getItem('civicChatHistories') || '{}');

const CATEGORY_ICONS = {
  'Pothole': '🕳️', 'Water Leakage': '💧', 'Broken Streetlight': '💡',
  'Garbage': '🗑️', 'Damaged Road': '🚧', 'Other': '📌',
};

const SEVERITY_COLORS = {
  'Low': '#00c48c', 'Medium': '#ffd700', 'High': '#ff8c42', 'Critical': '#ff4757'
};

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
  initMap();
  if (!GEMINI_API_KEY) {
    document.getElementById('apiModal').classList.remove('hidden');
  }
});

// ── LEAFLET MAP (free, no billing needed) ──
function initMap() {
  map = L.map('map').setView([20.5937, 78.9629], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
  }).addTo(map);

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      map.setView([pos.coords.latitude, pos.coords.longitude], 13);
    });
  }
  renderMapMarkers();
}

function renderMapMarkers() {
  if (!map) return;
  mapMarkers.forEach(m => map.removeLayer(m));
  mapMarkers = [];

  issues.forEach(issue => {
    if (!issue.lat || !issue.lng) return;
    const lat = parseFloat(issue.lat);
    const lng = parseFloat(issue.lng);
    if (isNaN(lat) || isNaN(lng)) return;

    const color = SEVERITY_COLORS[issue.severity] || '#00e5ff';
    const marker = L.circleMarker([lat, lng], {
      radius: issue.reportCount > 1 ? 14 : 10,
      fillColor: color,
      color: '#fff',
      weight: 2,
      fillOpacity: 0.9
    }).addTo(map);

    marker.bindPopup(`
      <div style="font-family:Inter,sans-serif;min-width:180px;padding:4px">
        <div style="font-size:1.2rem">${CATEGORY_ICONS[issue.category] || '📌'}</div>
        <div style="font-weight:600;margin:4px 0">${issue.title}</div>
        <div style="font-size:0.8rem;color:#666">📍 ${issue.location}</div>
        <div style="font-size:0.8rem;margin-top:6px">${issue.description}</div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
          <span style="background:${color}22;color:${color};padding:2px 8px;border-radius:99px;font-size:0.75rem;font-weight:600">${issue.severity}</span>
          <span style="background:#eee;color:#666;padding:2px 8px;border-radius:99px;font-size:0.75rem">${issue.status}</span>
          ${issue.reportCount > 1 ? `<span style="color:#7c5cfc;font-size:0.75rem;font-weight:600">👥 ${issue.reportCount} reports</span>` : ''}
        </div>
      </div>
    `);

    mapMarkers.push(marker);
  });

  if (mapMarkers.length > 0) {
    const group = L.featureGroup(mapMarkers);
    map.fitBounds(group.getBounds().pad(0.2));
  }
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
    if (map) { map.invalidateSize(); renderMapMarkers(); }
  } else if (name === 'dashboard') {
    document.getElementById('section-dashboard').classList.remove('hidden');
    renderDashboard();
  } else if (name === 'leaderboard') {
    document.getElementById('section-leaderboard').classList.remove('hidden');
    renderLeaderboard();
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
      notificationDraft: 'Dear Roads & Infrastructure Dept, a large pothole (~40cm) has been reported. Immediate repair is requested to prevent accidents.'
    }), 1500);
    return;
  }

  const prompt = `You are an autonomous civic-ops AI agent for a municipal issue reporting platform. Analyze this image and make a full chain of decisions:
1. Classify the issue type
2. Assess severity
3. Explain WHY that severity level was chosen (one short phrase)
4. Decide which municipal department should handle it
5. Draft a short, formal 2-sentence notification message addressed to that department

Respond ONLY in this exact JSON format (no markdown, no extra text):
{"category":"Pothole|Water Leakage|Broken Streetlight|Garbage|Damaged Road|Other","severity":"Low|Medium|High|Critical","description":"One clear sentence describing the issue","action":"One sentence recommended action","department":"Roads & Infrastructure|Sanitation Department|Electricity Board|Water Board|General Municipal Office","severityReason":"One short phrase explaining severity","notificationDraft":"A short formal 2-sentence notification addressed to the responsible department"}`;

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
    fillAIResult({
      category: 'Other', severity: 'Medium',
      description: 'Issue detected. Please review and categorize manually.',
      action: 'Report to local municipal authority for assessment.',
      department: 'General Municipal Office',
      severityReason: 'Default moderate priority due to inconclusive AI analysis.',
      notificationDraft: 'Dear Municipal Office, a community issue has been reported and requires manual review and categorization.'
    });
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
    },
    () => alert('Could not get location. Please enter manually.')
  );
}

// ── DUPLICATE DETECTION ──
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findDuplicate(category, lat, lng) {
  if (isNaN(lat) || isNaN(lng)) return null;
  return issues.find(i => {
    if (i.category !== category || i.status === 'Resolved') return false;
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
      ? `🤖 AI merged with nearby report & escalated to ${dup.severity} (${dup.reportCount} reports)!`
      : `🤖 AI matched with nearby report — merged (${dup.reportCount} total)`);
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
    upvotes: 0,
    resolutionSummary: '',
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

// ── UPVOTE ──
function upvoteIssue(id) {
  const issue = issues.find(i => i.id === id);
  if (!issue) return;
  const upvotedSet = JSON.parse(localStorage.getItem('civicUpvoted') || '[]');
  if (upvotedSet.includes(id)) { showToast('You already upvoted this issue', false); return; }
  issue.upvotes = (issue.upvotes || 0) + 1;
  upvotedSet.push(id);
  localStorage.setItem('civicUpvoted', JSON.stringify(upvotedSet));
  localStorage.setItem('civicIssues', JSON.stringify(issues));
  renderDashboard();
  showToast('👍 Upvoted! Helps prioritize this issue');
}

// ── AI RESOLUTION SUMMARY ──
async function generateResolutionSummary(issue) {
  if (!GEMINI_API_KEY) {
    return `${issue.category} issue at ${issue.location} has been resolved by the municipal ${issue.department}. The reported problem has been addressed and the area restored to normal condition.`;
  }
  const prompt = `You are a civic platform AI. Generate a short, professional 2-sentence resolution summary for a civic issue that was just marked as Resolved.

Issue details:
- Category: ${issue.category}
- Title: ${issue.title}
- Location: ${issue.location}
- Severity: ${issue.severity}
- Department: ${issue.department}
- Description: ${issue.description}

Write the summary as if the municipal department completed the work. Be specific and realistic. No markdown, just plain text 2 sentences.`;

  try {
    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 150 }
      })
    });
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || `Issue resolved by ${issue.department}.`;
  } catch {
    return `${issue.category} issue at ${issue.location} has been resolved by the municipal ${issue.department}.`;
  }
}

// ── STATUS UPDATE ──
async function updateStatus(id, newStatus) {
  const issue = issues.find(i => i.id === id);
  if (!issue) return;
  issue.status = newStatus;
  if (newStatus === 'Resolved' && !issue.resolutionSummary) {
    showToast('🤖 AI is generating resolution summary...');
    issue.resolutionSummary = await generateResolutionSummary(issue);
    showToast('✅ Issue resolved with AI summary generated!');
  } else {
    showToast(`Status updated to "${newStatus}"`);
  }
  localStorage.setItem('civicIssues', JSON.stringify(issues));
  updateStats();
  renderDashboard();
}

// ── DASHBOARD ──
function renderDashboard() {
  updateStats();
  const container = document.getElementById('issuesTable');
  if (!container) return;
  const upvotedSet = JSON.parse(localStorage.getItem('civicUpvoted') || '[]');
  if (issues.length === 0) {
    container.innerHTML = '<p style="color:var(--muted);padding:2rem;text-align:center">No issues yet. Go report one!</p>';
    return;
  }
  container.innerHTML = issues.map(issue => `
    <div class="table-row" id="row-${issue.id}">
      <span class="table-cat-icon">${CATEGORY_ICONS[issue.category] || '📌'}</span>
      <div>
        <div class="table-title-text">
          ${issue.title}
          ${issue.reportCount > 1 ? `<span class="dup-badge">👥 ${issue.reportCount}</span>` : ''}
        </div>
        <div class="table-location">📍 ${issue.location} · by ${issue.reporter} · ${timeAgo(issue.timestamp)}</div>
        ${issue.resolutionSummary ? `<div class="resolution-summary">✅ ${issue.resolutionSummary}</div>` : ''}
      </div>
      <span class="table-sev sev-${issue.severity}">${issue.severity}</span>
      <span class="pin-status status-${issue.status.toLowerCase().replace(' ','-')}">${issue.status}</span>
      <div class="action-btns">
        <button class="btn-icon upvote-btn ${upvotedSet.includes(issue.id) ? 'upvoted' : ''}" onclick="upvoteIssue(${issue.id})" title="Upvote">👍 ${issue.upvotes || 0}</button>
        <button class="btn-icon share-btn" onclick="openShareCard(${issue.id})" title="Share">📤</button>
        <button class="btn-icon chat-btn" onclick="openChatModal(${issue.id})" title="Ask AI">💬</button>
      </div>
      <select class="status-toggle" onchange="updateStatus(${issue.id}, this.value)">
        <option ${issue.status==='Reported'?'selected':''}>Reported</option>
        <option ${issue.status==='In Progress'?'selected':''}>In Progress</option>
        <option ${issue.status==='Resolved'?'selected':''}>Resolved</option>
      </select>
    </div>
  `).join('');
}

// ── LEADERBOARD ──
function computeLeaderboard() {
  const tally = {};
  issues.forEach(issue => {
    const names = (issue.mergedReports && issue.mergedReports.length) ? issue.mergedReports : [issue.reporter];
    names.forEach(name => { const key = name || 'Anonymous'; tally[key] = (tally[key] || 0) + 1; });
  });
  return Object.entries(tally).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
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
    ${issue.upvotes > 0 ? `<div class="share-card-reports">👍 ${issue.upvotes} upvote${issue.upvotes !== 1 ? 's' : ''}</div>` : ''}
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

// ── FOLLOW-UP Q&A CHAT ──
let activeChatIssueId = null;

function openChatModal(id) {
  const issue = issues.find(i => i.id === id);
  if (!issue) return;
  activeChatIssueId = id;
  document.getElementById('chatIssueTitle').textContent = `💬 Ask AI about: ${issue.title}`;
  renderChatHistory(id);
  document.getElementById('chatModal').classList.remove('hidden');
  document.getElementById('chatInput').focus();
}

function closeChatModal() {
  document.getElementById('chatModal').classList.add('hidden');
  activeChatIssueId = null;
}

function renderChatHistory(id) {
  const history = chatHistories[id] || [];
  const container = document.getElementById('chatMessages');
  if (history.length === 0) {
    container.innerHTML = `<div class="chat-hint">Ask anything about this issue — estimated fix time, who to contact, escalation steps, or similar problems in the area.</div>`;
    return;
  }
  container.innerHTML = history.map(msg => {
    const isUser = msg.role === 'user';
    const text = Array.isArray(msg.parts) ? msg.parts[0]?.text || '' : msg.parts;
    return `<div class="chat-bubble ${isUser ? 'chat-user' : 'chat-ai'}">
      <span class="chat-role">${isUser ? '👤 You' : '🤖 Gemini'}</span>
      <div class="chat-text">${text}</div>
    </div>`;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const userMsg = input.value.trim();
  if (!userMsg || !activeChatIssueId) return;
  const issue = issues.find(i => i.id === activeChatIssueId);
  if (!issue) return;
  input.value = '';

  if (!chatHistories[activeChatIssueId]) chatHistories[activeChatIssueId] = [];
  chatHistories[activeChatIssueId].push({ role: 'user', parts: [{ text: userMsg }] });
  renderChatHistory(activeChatIssueId);

  const container = document.getElementById('chatMessages');
  const typingEl = document.createElement('div');
  typingEl.className = 'chat-bubble chat-ai chat-typing';
  typingEl.innerHTML = '<span class="chat-role">🤖 Gemini</span><div class="chat-text">Thinking...</div>';
  container.appendChild(typingEl);
  container.scrollTop = container.scrollHeight;

  if (!GEMINI_API_KEY) {
    chatHistories[activeChatIssueId].push({
      role: 'model',
      parts: [{ text: `Based on this ${issue.category} issue (${issue.severity} severity), typical municipal response time is 3–7 business days. You can contact ${issue.department} directly or escalate through your local ward office.` }]
    });
    localStorage.setItem('civicChatHistories', JSON.stringify(chatHistories));
    renderChatHistory(activeChatIssueId);
    return;
  }

  const systemContext = `You are a helpful civic assistant for CivicLens. The user is asking about this issue:
- Title: ${issue.title}
- Category: ${issue.category}
- Severity: ${issue.severity}
- Location: ${issue.location}
- Description: ${issue.description}
- Status: ${issue.status}
- Department: ${issue.department}
${issue.resolutionSummary ? `- Resolution: ${issue.resolutionSummary}` : ''}
Answer concisely in under 3 sentences.`;

  const history = chatHistories[activeChatIssueId];
  let apiMessages = history.length <= 2
    ? [{ role: 'user', parts: [{ text: systemContext + '\n\nUser question: ' + userMsg }] }]
    : [
        { role: 'user', parts: [{ text: systemContext }] },
        { role: 'model', parts: [{ text: 'Understood. Ready to help.' }] },
        ...history
      ];

  try {
    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: apiMessages, generationConfig: { temperature: 0.5, maxOutputTokens: 200 } })
    });
    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Could not generate a response. Please try again.';
    chatHistories[activeChatIssueId].push({ role: 'model', parts: [{ text: reply }] });
    localStorage.setItem('civicChatHistories', JSON.stringify(chatHistories));
    renderChatHistory(activeChatIssueId);
  } catch {
    chatHistories[activeChatIssueId].push({ role: 'model', parts: [{ text: 'Error connecting to Gemini. Please check your API key.' }] });
    renderChatHistory(activeChatIssueId);
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.activeElement.id === 'chatInput' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

// ── ISSUE CLUSTERING ──
async function findSimilarIssues() {
  const btn = document.getElementById('clusterBtn');
  const output = document.getElementById('clusterOutput');
  if (issues.length < 2) {
    output.innerHTML = '<p style="color:var(--muted);margin-top:1rem">Report at least 2 issues to find clusters.</p>';
    output.classList.remove('hidden');
    return;
  }
  btn.disabled = true;
  btn.textContent = '🔍 Analyzing patterns...';
  output.classList.add('hidden');

  const issuesSummary = issues.filter(i => i.status !== 'Resolved')
    .map(i => `ID:${i.id} | ${i.category} | ${i.severity} | ${i.location} | lat:${i.lat||'unknown'} lng:${i.lng||'unknown'} | Reports:${i.reportCount||1}`)
    .join('\n');

  const prompt = `You are an autonomous civic analytics AI. Analyze these reported community issues and identify geographic or thematic clusters requiring priority intervention.

Active issues:
${issuesSummary}

Identify 2-3 clusters. For each provide: name, issueIds, reason, action.
Respond ONLY in this JSON format (no markdown):
{"clusters":[{"name":"string","issueIds":[numbers],"reason":"string","action":"string"}]}`;

  try {
    let aiResponse;
    if (!GEMINI_API_KEY) {
      aiResponse = { clusters: [
        { name: 'Road Infrastructure Hotspot', issueIds: [issues[0]?.id].filter(Boolean), reason: 'Multiple road-related issues detected suggesting infrastructure degradation.', action: 'Schedule comprehensive road survey and repair.' },
        { name: 'High-Priority Unresolved Issues', issueIds: issues.filter(i => i.severity==='Critical'||i.severity==='High').map(i=>i.id).slice(0,3), reason: 'Cluster of high-severity issues requiring immediate attention.', action: 'Escalate to senior municipal officer for emergency response.' }
      ]};
    } else {
      const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 500 } })
      });
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      aiResponse = JSON.parse(text.replace(/```json|```/g, '').trim());
    }
    renderClusters(aiResponse.clusters || []);
  } catch {
    output.innerHTML = '<p style="color:var(--red);margin-top:1rem">Could not analyze clusters. Please try again.</p>';
    output.classList.remove('hidden');
  }
  btn.disabled = false;
  btn.textContent = '🔍 Find Similar Issues Nearby';
}

function renderClusters(clusters) {
  const output = document.getElementById('clusterOutput');
  if (!clusters.length) {
    output.innerHTML = '<p style="color:var(--muted);margin-top:1rem">No significant clusters detected yet.</p>';
    output.classList.remove('hidden');
    return;
  }
  output.innerHTML = `
    <div class="cluster-header">🤖 AI identified ${clusters.length} cluster${clusters.length!==1?'s':''} requiring attention:</div>
    ${clusters.map(c => `
      <div class="cluster-card">
        <div class="cluster-name">📍 ${c.name}</div>
        <div class="cluster-ids">${(c.issueIds||[]).map(id => {
          const iss = issues.find(i => i.id===id);
          return iss ? `<span class="cluster-id-tag">#${id} ${iss.category}</span>` : '';
        }).join('')}</div>
        <div class="cluster-reason">${c.reason}</div>
        <div class="cluster-action">🏛️ <strong>Action:</strong> ${c.action}</div>
      </div>
    `).join('')}
  `;
  output.classList.remove('hidden');
}

// ── EXPORT REPORT ──
async function exportReport() {
  const btn = document.getElementById('exportBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Generating report...';

  const totalIssues = issues.length;
  const resolved = issues.filter(i => i.status==='Resolved').length;
  const critical = issues.filter(i => i.severity==='Critical').length;
  const categories = {};
  issues.forEach(i => { categories[i.category] = (categories[i.category]||0)+1; });
  const topCategory = Object.entries(categories).sort((a,b)=>b[1]-a[1])[0];

  let execSummary = `CivicLens Community Report: ${totalIssues} issues reported, ${resolved} resolved. ${critical} critical issues remain active. Most common: ${topCategory?topCategory[0]:'N/A'}.`;

  if (GEMINI_API_KEY && totalIssues > 0) {
    try {
      const prompt = `Generate a 3-sentence executive summary for a municipal civic report:
- Total issues: ${totalIssues}, Resolved: ${resolved}, Critical: ${critical}
- Breakdown: ${Object.entries(categories).map(([k,v])=>`${k}:${v}`).join(', ')}
Write as a formal municipal report. Plain text only, no markdown.`;
      const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{temperature:0.3,maxOutputTokens:150} })
      });
      const data = await response.json();
      execSummary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || execSummary;
    } catch {}
  }

  const now = new Date().toLocaleDateString('en-IN',{year:'numeric',month:'long',day:'numeric'});
  const reportHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>CivicLens Report</title>
<style>body{font-family:'Segoe UI',Arial,sans-serif;max-width:900px;margin:0 auto;padding:2rem;color:#1a1a2e}
.header{border-bottom:3px solid #00e5ff;padding-bottom:1.5rem;margin-bottom:2rem}
.title{font-size:2rem;font-weight:700}.sub{color:#666;font-size:0.9rem;margin-top:0.3rem}
.summary{background:#f0feff;border-left:4px solid #00e5ff;padding:1rem 1.5rem;margin-bottom:2rem;border-radius:0 8px 8px 0}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:2rem}
.box{background:#f8f9fa;border-radius:10px;padding:1rem;text-align:center;border:1px solid #e9ecef}
.num{font-size:2rem;font-weight:700;color:#00b5cc}.lbl{font-size:0.78rem;color:#666}
table{width:100%;border-collapse:collapse;font-size:0.85rem}
th{background:#0d0f14;color:white;padding:0.6rem 0.8rem;text-align:left}
td{padding:0.6rem 0.8rem;border-bottom:1px solid #eee;vertical-align:top}
tr:nth-child(even){background:#f8f9fa}
.footer{margin-top:3rem;padding-top:1rem;border-top:1px solid #eee;color:#999;font-size:0.78rem;text-align:center}
@media print{body{padding:1rem}}</style></head><body>
<div class="header"><div class="title">🏙️ CivicLens — Community Issues Report</div>
<div class="sub">Generated ${now} · Powered by Gemini AI · ${totalIssues} total issues</div></div>
<div class="summary"><strong>Executive Summary:</strong><br>${execSummary}</div>
<div class="grid">
<div class="box"><div class="num">${totalIssues}</div><div class="lbl">Total</div></div>
<div class="box"><div class="num">${resolved}</div><div class="lbl">Resolved</div></div>
<div class="box"><div class="num">${totalIssues-resolved}</div><div class="lbl">Active</div></div>
<div class="box"><div class="num">${critical}</div><div class="lbl">Critical</div></div></div>
<table><thead><tr><th>#</th><th>Title</th><th>Category</th><th>Severity</th><th>Location</th><th>Status</th><th>Date</th></tr></thead>
<tbody>${issues.map((iss,idx)=>`<tr><td>${idx+1}</td><td>${iss.title}${iss.resolutionSummary?`<br><small style="color:#555;font-style:italic">✅ ${iss.resolutionSummary}</small>`:''}</td><td>${CATEGORY_ICONS[iss.category]||''} ${iss.category}</td><td>${iss.severity}</td><td>${iss.location}</td><td>${iss.status}</td><td>${new Date(iss.timestamp).toLocaleDateString('en-IN')}</td></tr>`).join('')}
</tbody></table>
<div class="footer">CivicLens · Vibe2Ship Hackathon · Powered by Gemini AI</div></body></html>`;

  const blob = new Blob([reportHTML],{type:'text/html'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `CivicLens-Report-${new Date().toISOString().slice(0,10)}.html`;
  link.click();
  URL.revokeObjectURL(url);
  btn.disabled = false;
  btn.textContent = '📄 Export Full Report';
  showToast('📄 Report downloaded! Open in browser to print as PDF.');
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
  setTimeout(() => toast.classList.add('hidden'), 4000);
}
