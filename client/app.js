/**
 * app.js — UniGrade CGPA App Frontend Logic
 *
 * Responsibilities:
 *  1. Login form handling + validation
 *  2. POST /api/fetch-grades via SSE stream
 *  3. Real-time status updates + step indicators
 *  4. CGPA calculation (configurable grade scale)
 *  5. Dynamic dashboard population
 *  6. Semester accordion + grade chip coloring
 *  7. Editable grade scale with live recalculation
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// GRADE → GRADE POINT CONVERSION TABLE
// Keys are exact grade strings from the portal.
// Edit via the UI "Edit Scale" button or modify here.
// ─────────────────────────────────────────────────────────────
const DEFAULT_GRADE_SCALE = {
  'A+': 4.00,
  'A':  4.00,
  'A-': 3.70,
  'B+': 3.30,
  'B':  3.00,
  'B-': 2.70,
  'C+': 2.30,
  'C':  2.00,
  'C-': 1.70,
  'D+': 1.30,
  'D':  1.00,
  'F':  0.00,
  'W':  0.00,  // Withdrawn — counts as 0 in many systems; adjust if needed
  'I':  0.00,  // Incomplete
};

// ─────────────────────────────────────────────────────────────
// APP STATE
// ─────────────────────────────────────────────────────────────
const state = {
  gradeScale: { ...DEFAULT_GRADE_SCALE },
  semesterData: [],   // Raw data from API
  universityName: '',
};

// ─────────────────────────────────────────────────────────────
// DOM REFERENCES
// ─────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const UI = {
  loginPanel:         $('loginPanel'),
  loadingPanel:       $('loadingPanel'),
  errorPanel:         $('errorPanel'),
  dashboard:          $('dashboard'),
  loginForm:          $('loginForm'),
  username:           $('username'),
  password:           $('password'),
  universityName:     $('universityName'),
  togglePassword:     $('togglePassword'),
  eyeShow:            $('eyeShow'),
  eyeHide:            $('eyeHide'),
  fetchBtn:           $('fetchBtn'),
  resetBtn:           $('resetBtn'),
  retryBtn:           $('retryBtn'),
  statusText:         $('statusText'),
  mockBadge:          $('mockBadge'),

  // Steps
  stepLoginIcon:      $('step-login-icon'),
  stepFetchIcon:      $('step-fetch-icon'),
  stepSyncIcon:       $('step-sync-icon'),
  stepLoginText:      $('step-login-text'),
  stepFetchText:      $('step-fetch-text'),
  stepSyncText:       $('step-sync-text'),

  // Dashboard
  cgpaDisplay:        $('cgpaDisplay'),
  totalCreditsDisplay:$('totalCreditsDisplay'),
  semesterCountDisplay:$('semesterCountDisplay'),
  semesterList:       $('semesterList'),
  errorMessage:       $('errorMessage'),
  studentInfoBar:     $('studentInfoBar'),
  studentInitial:     $('studentInitial'),
  studentNameDisplay: $('studentNameDisplay'),
  universityDisplay:  $('universityDisplay'),

  // Grade Scale
  gradeScaleDisplay:  $('gradeScaleDisplay'),
  gradeScaleEditor:   $('gradeScaleEditor'),
  gradeScaleInput:    $('gradeScaleInput'),
  editScaleBtn:       $('editScaleBtn'),
  applyScaleBtn:      $('applyScaleBtn'),
};

// ─────────────────────────────────────────────────────────────
// PANEL MANAGEMENT
// ─────────────────────────────────────────────────────────────
function showPanel(panelName) {
  const panels = ['loginPanel', 'loadingPanel', 'errorPanel', 'dashboard'];
  panels.forEach((p) => {
    const el = $(p);
    if (el) el.classList.add('hidden');
  });
  const target = $(panelName);
  if (target) target.classList.remove('hidden');

  UI.resetBtn.classList.toggle('hidden', panelName === 'loginPanel' || panelName === 'loadingPanel');
}

// ─────────────────────────────────────────────────────────────
// STEP INDICATORS
// ─────────────────────────────────────────────────────────────
const STEP_KEYWORDS = {
  login:  ['logging', 'navigating', 'launching', 'credential', 'secure browser', 'portal'],
  fetch:  ['fetching', 'results', 'scraping', 'parsing'],
  sync:   ['syncing', 'sync', 'populating', 'mock mode', 'returning'],
};

const CHECK_SVG = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
</svg>`;

function updateStepFromMessage(message) {
  const msg = message.toLowerCase();

  if (STEP_KEYWORDS.login.some((k) => msg.includes(k))) {
    setStepActive('login');
  }
  if (STEP_KEYWORDS.fetch.some((k) => msg.includes(k))) {
    setStepDone('login');
    setStepActive('fetch');
  }
  if (STEP_KEYWORDS.sync.some((k) => msg.includes(k))) {
    setStepDone('login');
    setStepDone('fetch');
    setStepActive('sync');
  }
}

function setStepActive(step) {
  const icon = $(`step-${step}-icon`);
  if (!icon) return;
  icon.className = 'step-icon step-active';
  icon.innerHTML = `<span class="animate-pulse-fast">●</span>`;
}

function setStepDone(step) {
  const icon = $(`step-${step}-icon`);
  if (!icon) return;
  icon.className = 'step-icon step-done';
  icon.innerHTML = CHECK_SVG;
}

function resetSteps() {
  ['login', 'fetch', 'sync'].forEach((step) => {
    const icon = $(`step-${step}-icon`);
    if (icon) {
      icon.className = 'step-icon step-pending';
      icon.innerHTML = step === 'login' ? '1' : step === 'fetch' ? '2' : '3';
    }
  });
}

// ─────────────────────────────────────────────────────────────
// FORM VALIDATION
// ─────────────────────────────────────────────────────────────
function validateForm() {
  let valid = true;

  const usernameVal = UI.username.value.trim();
  if (!usernameVal) {
    UI.username.classList.add('error');
    $('usernameError').classList.remove('hidden');
    valid = false;
  } else {
    UI.username.classList.remove('error');
    $('usernameError').classList.add('hidden');
  }

  const passwordVal = UI.password.value;
  if (!passwordVal) {
    UI.password.classList.add('error');
    $('passwordError').classList.remove('hidden');
    valid = false;
  } else {
    UI.password.classList.remove('error');
    $('passwordError').classList.add('hidden');
  }

  return valid;
}

// ─────────────────────────────────────────────────────────────
// FETCH GRADES — SSE Streaming
// ─────────────────────────────────────────────────────────────
async function fetchGrades(username, password) {
  showPanel('loadingPanel');
  resetSteps();
  UI.statusText.textContent = 'Connecting to server...';

  try {
    const response = await fetch('/api/fetch-grades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    // Check for non-SSE error responses (400, 401, etc.)
    if (!response.ok && response.headers.get('content-type')?.includes('application/json')) {
      const err = await response.json();
      throw new Error(err.error || 'Server returned an error.');
    }

    // Parse SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;

        let event;
        try {
          event = JSON.parse(raw);
        } catch {
          continue;
        }

        if (event.type === 'status') {
          UI.statusText.textContent = event.message;
          updateStepFromMessage(event.message);
        }

        if (event.type === 'done') {
          setStepDone('login');
          setStepDone('fetch');
          setStepDone('sync');
          await delay(300);
          handleSuccess(event.semesters);
          return;
        }

        if (event.type === 'error') {
          throw new Error(event.message);
        }
      }
    }
  } catch (err) {
    console.error('[Fetch Error]', err);
    showError(err.message || 'Could not connect to the server. Is it running?');
  }
}

// ─────────────────────────────────────────────────────────────
// SUCCESS — POPULATE DASHBOARD
// ─────────────────────────────────────────────────────────────
function handleSuccess(semesters) {
  state.semesterData = semesters;
  populateDashboard(semesters);
  showPanel('dashboard');

  // Show mock badge if demo data
  checkMockMode();
}

async function checkMockMode() {
  try {
    const r = await fetch('/api/health');
    const data = await r.json();
    if (data.mock) {
      UI.mockBadge.classList.remove('hidden');
    }
  } catch {}
}

function populateDashboard(semesters) {
  // Student info bar
  const username = UI.username.value.trim();
  const univName = UI.universityName.value.trim();
  state.universityName = univName;

  if (username) {
    UI.studentInfoBar.classList.remove('hidden');
    UI.studentInitial.textContent = username.charAt(0).toUpperCase();
    UI.studentNameDisplay.textContent = username;
    UI.universityDisplay.textContent = univName || 'University Portal';
  }

  // CGPA calculation
  const { cgpa, totalCredits } = calculateCGPA(semesters);

  // Animate CGPA display
  animateNumber(UI.cgpaDisplay, 0, cgpa, 1200, (v) => v.toFixed(2));
  animateNumber(UI.totalCreditsDisplay, 0, totalCredits, 800, (v) => Math.round(v));
  UI.semesterCountDisplay.textContent = semesters.length;

  // CGPA progress bar
  const barFill = document.querySelector('.cgpa-bar-fill');
  if (barFill) {
    setTimeout(() => {
      barFill.style.width = `${Math.min((cgpa / 4.0) * 100, 100).toFixed(1)}%`;
    }, 200);
  }

  // Render grade scale
  renderGradeScale();

  // Render semester accordion
  renderSemesters(semesters);
}

// ─────────────────────────────────────────────────────────────
// CGPA CALCULATION ENGINE
// ─────────────────────────────────────────────────────────────
function gradeToPoints(grade) {
  const clean = grade.trim().toUpperCase();
  if (state.gradeScale.hasOwnProperty(clean)) {
    return state.gradeScale[clean];
  }
  // Try partial match (e.g., "A " → "A")
  for (const [key, val] of Object.entries(state.gradeScale)) {
    if (clean.startsWith(key)) return val;
  }
  return null; // Grade not in scale — excluded from calculation
}

function calculateSemesterGPA(courses) {
  let totalPoints = 0;
  let totalCredits = 0;

  courses.forEach((course) => {
    const points = gradeToPoints(course.grade);
    if (points === null) return; // Skip ungraded courses
    totalPoints += points * course.credits;
    totalCredits += course.credits;
  });

  const gpa = totalCredits > 0 ? totalPoints / totalCredits : 0;
  return { gpa, totalCredits };
}

function calculateCGPA(semesters) {
  let cumulativePoints = 0;
  let totalCredits = 0;

  semesters.forEach((semester) => {
    const { gpa, totalCredits: credits } = calculateSemesterGPA(semester.courses);
    cumulativePoints += gpa * credits;
    totalCredits += credits;
  });

  const cgpa = totalCredits > 0 ? cumulativePoints / totalCredits : 0;
  return { cgpa, totalCredits };
}

// ─────────────────────────────────────────────────────────────
// RENDER SEMESTER ACCORDION
// ─────────────────────────────────────────────────────────────
function renderSemesters(semesters) {
  UI.semesterList.innerHTML = '';

  semesters.forEach((semester, idx) => {
    const { gpa, totalCredits } = calculateSemesterGPA(semester.courses);

    const card = document.createElement('div');
    card.className = 'semester-card';
    card.id = `semester-${idx}`;

    card.innerHTML = `
      <div class="semester-header" role="button" aria-expanded="false" aria-controls="sem-content-${idx}" onclick="toggleSemester(${idx})">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-600/30 to-accent-600/30 border border-white/8 flex items-center justify-center text-xs font-bold text-primary-300">
            S${idx + 1}
          </div>
          <div>
            <p class="font-semibold text-sm text-gray-100">${escapeHtml(semester.semester)}</p>
            <p class="text-xs text-gray-500">${semester.courses.length} courses · ${totalCredits} credits</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <span class="gpa-pill">${gpa.toFixed(2)} GPA</span>
          <svg class="chevron-icon w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
      </div>

      <div class="semester-content" id="sem-content-${idx}">
        <!-- Table Header -->
        <div class="course-row-item text-xs font-semibold uppercase tracking-widest text-gray-600 bg-white/1">
          <span>Code</span>
          <span>Course</span>
          <span class="text-center">Cr.</span>
          <span class="text-right">Grade</span>
        </div>

        <!-- Course Rows -->
        ${semester.courses.map((course) => renderCourseRow(course)).join('')}

        <!-- Semester GPA Bar -->
        <div class="px-5 py-4 border-t border-white/5 bg-white/1">
          <div class="flex items-center justify-between text-xs mb-1.5">
            <span class="text-gray-500">Semester GPA</span>
            <span class="font-bold text-gray-200">${gpa.toFixed(2)} / 4.00</span>
          </div>
          <div class="cgpa-bar-track">
            <div class="cgpa-bar-fill" style="width: ${((gpa / 4.0) * 100).toFixed(1)}%; transition-delay: ${idx * 80}ms"></div>
          </div>
        </div>
      </div>
    `;

    UI.semesterList.appendChild(card);
  });

  // Auto-open first semester
  if (semesters.length > 0) {
    toggleSemester(0);
  }
}

function renderCourseRow(course) {
  const points = gradeToPoints(course.grade);
  const pointsDisplay = points !== null ? `(${points.toFixed(1)} pts)` : '';
  const gradeClass = getGradeClass(course.grade);

  return `
    <div class="course-row-item">
      <span class="font-mono text-xs text-gray-400">${escapeHtml(course.code)}</span>
      <span class="text-gray-200 truncate" title="${escapeHtml(course.name)}">${escapeHtml(course.name)}</span>
      <span class="text-center text-gray-400">${course.credits}</span>
      <span class="text-right flex items-center justify-end gap-1.5">
        <span class="grade-chip ${gradeClass}">${escapeHtml(course.grade)}</span>
        <span class="text-gray-600 text-xs hidden sm:inline">${pointsDisplay}</span>
      </span>
    </div>
  `;
}

function getGradeClass(grade) {
  const g = grade.trim().toUpperCase();
  if (g.startsWith('A')) return 'grade-A';
  if (g.startsWith('B')) return 'grade-B';
  if (g.startsWith('C')) return 'grade-C';
  if (g.startsWith('D')) return 'grade-D';
  if (g === 'F' || g === 'W') return 'grade-F';
  return 'grade-NA';
}

// ─────────────────────────────────────────────────────────────
// ACCORDION TOGGLE
// ─────────────────────────────────────────────────────────────
function toggleSemester(idx) {
  const card = $(`semester-${idx}`);
  const content = $(`sem-content-${idx}`);
  if (!card || !content) return;

  const isOpen = content.classList.contains('open');

  // Close all
  document.querySelectorAll('.semester-content').forEach((el) => el.classList.remove('open'));
  document.querySelectorAll('.semester-card').forEach((el) => el.classList.remove('open'));

  if (!isOpen) {
    content.classList.add('open');
    card.classList.add('open');
    const header = card.querySelector('.semester-header');
    if (header) header.setAttribute('aria-expanded', 'true');
  }
}

// Expose for inline onclick
window.toggleSemester = toggleSemester;

// ─────────────────────────────────────────────────────────────
// GRADE SCALE EDITOR
// ─────────────────────────────────────────────────────────────
function renderGradeScale() {
  UI.gradeScaleDisplay.innerHTML = '';
  Object.entries(state.gradeScale).forEach(([grade, points]) => {
    const chip = document.createElement('span');
    chip.className = 'scale-chip';
    chip.innerHTML = `<span class="grade-label">${escapeHtml(grade)}</span><span>= ${points.toFixed(1)}</span>`;
    UI.gradeScaleDisplay.appendChild(chip);
  });

  // Populate textarea
  UI.gradeScaleInput.value = Object.entries(state.gradeScale)
    .map(([g, p]) => `${g}=${p}`)
    .join(', ');
}

UI.editScaleBtn.addEventListener('click', () => {
  const isHidden = UI.gradeScaleEditor.classList.contains('hidden');
  UI.gradeScaleEditor.classList.toggle('hidden', !isHidden);
  UI.editScaleBtn.textContent = isHidden ? 'Close' : 'Edit';
});

UI.applyScaleBtn.addEventListener('click', () => {
  const rawInput = UI.gradeScaleInput.value;
  const newScale = {};
  let hasError = false;

  rawInput.split(',').forEach((pair) => {
    const [grade, points] = pair.trim().split('=');
    if (!grade || points === undefined) return;
    const val = parseFloat(points.trim());
    if (isNaN(val) || val < 0 || val > 4.0) {
      hasError = true;
      return;
    }
    newScale[grade.trim().toUpperCase()] = val;
  });

  if (hasError || Object.keys(newScale).length === 0) {
    UI.gradeScaleInput.style.borderColor = 'rgba(239,68,68,0.5)';
    setTimeout(() => { UI.gradeScaleInput.style.borderColor = ''; }, 2000);
    return;
  }

  state.gradeScale = newScale;
  renderGradeScale();

  // Recalculate and re-render
  if (state.semesterData.length > 0) {
    const { cgpa, totalCredits } = calculateCGPA(state.semesterData);
    UI.cgpaDisplay.textContent = cgpa.toFixed(2);
    UI.totalCreditsDisplay.textContent = totalCredits;

    const barFill = document.querySelector('.cgpa-bar-fill');
    if (barFill) barFill.style.width = `${Math.min((cgpa / 4.0) * 100, 100).toFixed(1)}%`;

    renderSemesters(state.semesterData);
  }

  UI.gradeScaleEditor.classList.add('hidden');
  UI.editScaleBtn.textContent = 'Edit';
});

// ─────────────────────────────────────────────────────────────
// ERROR DISPLAY
// ─────────────────────────────────────────────────────────────
function showError(message) {
  UI.errorMessage.textContent = message;
  showPanel('errorPanel');
}

// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function animateNumber(el, from, to, duration, formatter) {
  const start = performance.now();
  const update = (now) => {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const value = from + (to - from) * eased;
    el.textContent = formatter(value);
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

// ─────────────────────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────────────────────

// Form submit
UI.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  const username = UI.username.value.trim();
  const password = UI.password.value;

  await fetchGrades(username, password);
});

// Toggle password visibility
UI.togglePassword.addEventListener('click', () => {
  const isPassword = UI.password.type === 'password';
  UI.password.type = isPassword ? 'text' : 'password';
  UI.eyeShow.classList.toggle('hidden', isPassword);
  UI.eyeHide.classList.toggle('hidden', !isPassword);
});

// Reset / New Login
UI.resetBtn.addEventListener('click', () => {
  state.semesterData = [];
  UI.username.value = '';
  UI.password.value = '';
  UI.universityName.value = '';
  UI.password.type = 'password';
  UI.eyeShow.classList.remove('hidden');
  UI.eyeHide.classList.add('hidden');
  UI.mockBadge.classList.add('hidden');
  UI.semesterList.innerHTML = '';
  showPanel('loginPanel');
});

// Retry from error
UI.retryBtn.addEventListener('click', () => {
  showPanel('loginPanel');
});

// Clear validation errors on input
UI.username.addEventListener('input', () => {
  UI.username.classList.remove('error');
  $('usernameError').classList.add('hidden');
});
UI.password.addEventListener('input', () => {
  UI.password.classList.remove('error');
  $('passwordError').classList.add('hidden');
});

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────
(function init() {
  showPanel('loginPanel');

  // Add CGPA bar to the summary card dynamically
  const cgpaCard = UI.cgpaDisplay.closest('.glass-card');
  if (cgpaCard) {
    const bar = document.createElement('div');
    bar.className = 'cgpa-bar-track';
    bar.innerHTML = `<div class="cgpa-bar-fill"></div>`;
    cgpaCard.appendChild(bar);
  }
})();
