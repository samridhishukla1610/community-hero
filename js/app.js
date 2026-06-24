// ── CONFIG ──
// 🔑 PASTE YOUR GEMINI API KEY HERE (or enter via the popup):
let GEMINI_API_KEY = localStorage.getItem('civicLensKey') || '';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// ── STATE ──
let issues = JSON.parse(localStorage.getItem('civicIssues') || '[]');
let currentPhotoBase64 = null;
let currentSeverity = '';

const CATEGORY_ICONS = {
  'Pothole': '🕳️',
  'Water Leakage': '💧',
  'Broken Streetlight': '💡',
  'Garbage': '🗑️',
  'Damaged Road': '🚧',
  'Other': '📌',
};

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  updateStats();
  if (!GEMINI_API_KEY) {
    document.getElementById('apiModal').classList.remove('hidden');
  }
});

// ── API KEY ──
function saveApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (key) {
    GEMINI_API_KEY = key;
    localStorage.setItem('civicLensKey', key);
  }
  closeModal();
}

function closeModal() {
  document.getElementById('apiModal').classList.add('hidden');
}

// ── NAVIGATION ──
function showSection(name) {
  // Hide all
  ['section-report', 'section-map', 'section-dashboard', 'hero'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  // Update nav
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');

  if (name === 'report') {
    document.getElementById('hero').classList.remove('hidden');
    document.getElementById('section-report').classList.remove('hidden');
  } else if (name === 'map') {
    document.getElementById('section-map').classList.remove('hidden');
    renderMapList();
  } else if (name === 'dashboard') {
    document.getElementById('section-dashboard').classList.remove('hidden');
    renderDashboard();
  }
}

// ── PHOTO UPLOAD ──
function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    currentPhotoBase64 = dataUrl.split(',')[1]; // base64 only

    // Show preview
    document.getElementById('uploadZone').classList.add('hidden');
    document.getElementById('previewWrap').classList.remove('hidden');
    document.getElementById('photoPreview').src = dataUrl;

    // Start AI analysis
    analyzeWithGemini(currentPhotoBase64);
  };
  reader.readAsDataURL(file);
}

function resetPhoto() {
  currentPhotoBase64 = null;
  document.getElementById('uploadZone').classList.remove('hidden');
  document.getElementById('previewWrap').classList.add('hidden');
  document.getElementById('previewWrap').classList.add('hidden');
  document.getElementById('aiStatus').classList.add('hidden');
  document.getElementById('aiResult').classList.add('hidden');
  document.getElementById('photoInput').value = '';
}

// ── GEMINI AI ANALYSIS ──
async function analyzeWithGemini(base64Image) {
  document.getElementById('aiStatus').classList.remove('hidden');
  document.getElementById('aiResult').classList.add('hidden');

  if (!GEMINI_API_KEY) {
    // Demo mode - fill with mock data
    setTimeout(() => {
      fillAIResult({
        category: 'Pothole',
        severity: 'High',
        description: 'A large pothole approximately 40cm wide detected on the road surface. Poses risk to vehicles and pedestrians.',
        action: 'Notify municipal road maintenance department. Temporary barricading recommended.'
      });
    }, 1500);
    return;
  }

  const prompt = `You are a civic issue analysis AI. Analyze this image and identify any community infrastructure problems.

Respond ONLY in this exact JSON format (no markdown, no extra text):
{
  "category": "Pothole|Water Leakage|Broken Streetlight|Garbage|Damaged Road|Other",
  "severity": "Low|Medium|High|Critical",
  "description": "One clear sentence describing the issue and its visible impact",
  "action": "One sentence recommended action for municipal authorities"
}

If no issue is visible, use category "Other" and describe what you see.`;

  try {
    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: base64Image
              }
            },
            { text: prompt }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 300 }
      })
    });

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    fillAIResult(result);

  } catch (err) {
    console.error('Gemini error:', err);
    // Fallback
    fillAIResult({
      category: 'Other',
      severity: 'Medium',
      description: 'Issue detected in the image. Please review and categorize manually.',
      action: 'Report to local municipal authority for assessment.'
    });
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

  // Auto-fill form
  document.getElementById('issueCategory').value = result.category;
  document.getElementById('issueDesc').value = result.description;
  setSeverity(result.severity);

  if (!document.getElementById('issueTitle').value) {
    document.getElementById('issueTitle').value = `${result.category} — needs attention`;
  }
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
    },
    () => alert('Could not get location. Please enter manually.')
  );
}

// ── SUBMIT ISSUE ──
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
    id: Date.now(),
    title,
    category,
    severity,
    description: desc,
    location: location || 'Location not specified',
    lat: document.getElementById('issueLat').value,
    lng: document.getElementById('issueLng').value,
    reporter,
    status: 'Reported',
    timestamp: new Date().toISOString(),
    photo: currentPhotoBase64 ? `data:image/jpeg;base64,${currentPhotoBase64}` : null,
  };

  issues.unshift(issue);
  localStorage.setItem('civicIssues', JSON.stringify(issues));
  updateStats();
  resetForm();
  showToast('Issue reported successfully! 🎉');
}

function resetForm() {
  document.getElementById('issueTitle').value = '';
  document.getElementById('issueCategory').value = '';
  document.getElementById('issueDesc').value = '';
  document.getElementById('issueLocation').value = '';
  document.getElementById('reporterName').value = '';
  document.getElementById('issueLat').value = '';
  document.getElementById('issueLng').value = '';
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

  ['stat-total', 'dash-total'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = total;
  });
  ['stat-resolved', 'dash-resolved'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = resolved;
  });
  ['stat-pending', 'dash-pending'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = pending;
  });

  const critical = issues.filter(i => i.severity === 'Critical').length;
  const dashCrit = document.getElementById('dash-critical');
  if (dashCrit) dashCrit.textContent = critical;
}

// ── MAP LIST ──
function renderMapList() {
  const container = document.getElementById('issuesList');
  if (!container) return;

  if (issues.length === 0) {
    container.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem">No issues reported yet. Be the first!</p>';
    return;
  }

  container.innerHTML = issues.map(issue => `
    <div class="issue-pin">
      <div class="pin-icon">${CATEGORY_ICONS[issue.category] || '📌'}</div>
      <div class="pin-info">
        <div class="pin-title">${issue.title}</div>
        <div class="pin-meta">📍 ${issue.location} · ${timeAgo(issue.timestamp)}</div>
      </div>
      <span class="pin-status status-${issue.status.toLowerCase().replace(' ','-')}">${issue.status}</span>
    </div>
  `).join('');
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
        <div class="table-location">📍 ${issue.location} · by ${issue.reporter}</div>
      </div>
      <span class="table-sev sev-${issue.severity}">${issue.severity}</span>
      <span class="pin-status status-${issue.status.toLowerCase().replace(' ','-')}">${issue.status}</span>
      <select class="status-toggle" onchange="updateStatus(${issue.id}, this.value)">
        <option ${issue.status === 'Reported' ? 'selected' : ''}>Reported</option>
        <option ${issue.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
        <option ${issue.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
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
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function showToast(msg, success = true) {
  const toast = document.getElementById('toast');
  const icon = toast.querySelector('.toast-icon');
  document.getElementById('toastMsg').textContent = msg;
  icon.textContent = success ? '✅' : '⚠️';
  toast.style.background = success ? 'var(--green)' : 'var(--orange)';
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}
