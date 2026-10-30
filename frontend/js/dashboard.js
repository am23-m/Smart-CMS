let currentUser = null;
let currentSelectedZone = 'Classroom';
let detectedDuplicateTicketId = null;
let dupDebounceTimer = null;

// EXPANDED CAMPUS SUB-CATEGORIES
const CAMPUS_SUB_CATEGORIES = {
  'Classroom': [
    'Air Conditioning (AC) / Poor Cooling',
    'Projector / Smartboard HDMI Display',
    'Audio Mic / Speaker Echo Issue',
    'Broken Benches / Desks / Chairs',
    'Tubelight / Ceiling Fan Dead',
    'Whiteboard / Marker Problem',
    'Other / Custom Classroom Issue'
  ],
  'Library': [
    'Air Conditioning (AC) / Ventilation',
    'Wi-Fi / Digital Library Terminal Error',
    'Noise & Discipline Disturbance',
    'Dead Power Socket on Study Desk',
    'Book RFID Scanner / Issuance Issue',
    'Other / Custom Library Issue'
  ],
  'Canteen / Mess': [
    'Food Hygiene & Quality Complaint',
    'Drinking Water Cooler Unclean / Dead',
    'Uncleaned Dining Tables / Floor',
    'Overpricing / Billing Delay',
    'Mess Menu / Timings Dispute',
    'Other / Custom Canteen Issue'
  ],
  'Labs / Workstation': [
    'Air Conditioning (AC) in Lab',
    'Workstation PC / LAN Connection Issue',
    'Software / Licensing Error',
    'Equipment Calibration Fault',
    'Chemical Smell / Poor Exhaust',
    'Other / Custom Lab Issue'
  ],
  'Hostel': [
    'Air Cooler / Geyser / Power Fault',
    'Washroom Leakage / Flush Broken',
    'Room Key & Door Lock Issue',
    'Room / Corridor Cleanliness',
    'Water Purifier Dead',
    'Other / Custom Hostel Issue'
  ],
  'Anti-Ragging': [
    'Senior Threat / Intimidation',
    'Verbal / Physical Bullying',
    'Hostel Discipline / Curfew Breach',
    'Emergency Security Alert'
  ]
};

document.addEventListener('DOMContentLoaded', async () => {
  await initSession();
  setupZoneSubCategories();
  await loadNotices();
  await loadComplaints();
});

async function initSession() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();

    if (!data.authenticated) {
      window.location.href = 'login.html';
      return;
    }

    currentUser = data.user;
    const isAdmin = currentUser.role === 'admin';

    document.getElementById('nav-user-name').textContent = currentUser.name || 'AM';
    document.getElementById('nav-user-dept').textContent = currentUser.department;
    document.getElementById('nav-user-role').textContent = isAdmin ? 'Teacher / Admin' : 'Student';

    document.querySelectorAll('.student-only').forEach(el => el.style.display = isAdmin ? 'none' : '');
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = isAdmin ? '' : 'none');

    // Setup Profile Tab View based on role
    document.getElementById('prof-name').value = currentUser.name || 'AM';
    document.getElementById('prof-email').value = currentUser.email;
    document.getElementById('prof-phone').value = currentUser.phone || '';

    if (isAdmin) {
      document.getElementById('prof-student-details').style.display = 'none';
      document.getElementById('prof-admin-details').style.display = 'block';
      document.getElementById('prof-admin-id').value = currentUser.admin_id || 'N/A';
      document.getElementById('prof-admin-unit').value = currentUser.department || 'N/A';
      await loadAdminFeedbacks(); // Load student feedbacks for admin
    } else {
      document.getElementById('prof-student-details').style.display = 'block';
      document.getElementById('prof-admin-details').style.display = 'none';
      document.getElementById('prof-dept').value = currentUser.department || 'N/A';
      document.getElementById('prof-roll').value = currentUser.roll_number || 'N/A';
      if (currentUser.academic_year) document.getElementById('prof-year').value = currentUser.academic_year;
      if (currentUser.section) document.getElementById('prof-section').value = currentUser.section;
    }
  } catch (err) {
    window.location.href = 'login.html';
  }
}

function switchDashboardTab(tabName) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.sidebar-menu a').forEach(el => el.classList.remove('active'));

  const activePane = document.getElementById(`tab-${tabName}`);
  if (activePane) activePane.classList.add('active');

  const links = document.querySelectorAll('.sidebar-menu a');
  links.forEach(l => {
    if (l.getAttribute('onclick') && l.getAttribute('onclick').includes(tabName)) {
      l.classList.add('active');
    }
  });

  const titles = {
    'overview': 'Dashboard Overview',
    'submit-complaint': 'Register Complaint',
    'my-complaints': 'My Complaints',
    'track-ticket': 'Live Complaint Tracker',
    'manage-complaints': 'Manage Complaints',
    'view-feedbacks': 'Student Feedbacks Audit',
    'post-notice': 'Broadcast Notice',
    'feedback': 'Feedback',
    'profile': 'My Profile'
  };
  document.getElementById('portal-view-title').textContent = titles[tabName] || 'Dashboard';
}

function selectCampusZone(zone, cardEl) {
  currentSelectedZone = zone;
  document.querySelectorAll('.zone-selector-card').forEach(c => c.classList.remove('active'));
  cardEl.classList.add('active');
  setupZoneSubCategories();
  checkDuplicateIssueDebounced();
}

function setupZoneSubCategories() {
  const sel = document.getElementById('comp-subcategory');
  if (!sel) return;
  const list = CAMPUS_SUB_CATEGORIES[currentSelectedZone] || ['General Concern'];
  sel.innerHTML = list.map(item => `<option value="${item}">${item}</option>`).join('');
}

// ----------------- DUPLICATE ISSUE DETECTION -----------------
function checkDuplicateIssueDebounced() {
  clearTimeout(dupDebounceTimer);
  dupDebounceTimer = setTimeout(checkDuplicateIssue, 400);
}

async function checkDuplicateIssue() {
  const title = document.getElementById('comp-title').value.trim();
  if (title.length < 4) {
    dismissDuplicateBox();
    return;
  }

  try {
    const res = await fetch('/api/complaints/check-duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone: currentSelectedZone, title })
    });
    const data = await res.json();

    const box = document.getElementById('duplicate-match-box');
    if (data.found && data.matches.length > 0) {
      const match = data.matches[0];
      detectedDuplicateTicketId = match.id;
      document.getElementById('dup-issue-desc').textContent = 
        `"${match.title}" at ${match.location} is already under resolution. (Repetitions: ${match.upvotes} Students affected).`;
      box.style.display = 'block';
    } else {
      dismissDuplicateBox();
    }
  } catch (e) {}
}

function dismissDuplicateBox() {
  const box = document.getElementById('duplicate-match-box');
  if (box) box.style.display = 'none';
  detectedDuplicateTicketId = null;
}

async function upvoteExistingTicket() {
  if (!detectedDuplicateTicketId) return;

  try {
    const res = await fetch(`/api/complaints/${detectedDuplicateTicketId}/upvote`, { method: 'POST' });
    const data = await res.json();
    alert(data.message);
    dismissDuplicateBox();
    document.getElementById('form-complaint').reset();
    await loadComplaints();
    switchDashboardTab('my-complaints');
  } catch (err) {
    alert('Failed to register upvote.');
  }
}

// ----------------- 24-HOUR NOTICES -----------------
async function loadNotices() {
  try {
    const res = await fetch('/api/notices');
    const data = await res.json();
    const container = document.getElementById('notice-broadcast-container');

    if (data.success && data.notices.length > 0) {
      container.innerHTML = data.notices.map(n => `
        <div class="notice-broadcast-wrapper">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span class="notice-pill-tag">CAMPUS NOTICE (24h)</span>
              <strong style="color: var(--navy-primary);">${escapeHtml(n.title)}</strong>
            </div>
            <p style="color: #475569; font-size: 0.875rem;">${escapeHtml(n.content)}</p>
          </div>
          <small style="color: var(--text-muted); font-size: 0.75rem;">Posted by ${escapeHtml(n.posted_by)}</small>
        </div>
      `).join('');
    } else {
      container.innerHTML = '';
    }
  } catch (err) {}
}

async function handleNoticeSubmit(e) {
  e.preventDefault();
  const title = document.getElementById('notice-title').value.trim();
  const content = document.getElementById('notice-content').value.trim();

  try {
    const res = await fetch('/api/notices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showPageAlert('dashboard-global-alert', data.message, 'success');
      e.target.reset();
      await loadNotices();
      switchDashboardTab('overview');
    }
  } catch (err) {
    alert('Notice broadcast error.');
  }
}

// ----------------- COMPLAINT FILING & TRACKING -----------------
async function handleComplaintSubmit(e) {
  e.preventDefault();
  
  const subCategoryEl = document.getElementById('comp-subcategory');
  const sub_category = subCategoryEl && subCategoryEl.value ? subCategoryEl.value : 'General Concern';
  const title = document.getElementById('comp-title').value.trim();
  const location = document.getElementById('comp-location').value.trim();
  const priority = document.getElementById('comp-priority').value;
  const description = document.getElementById('comp-desc').value.trim();

  try {
    const res = await fetch('/api/complaints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        zone: currentSelectedZone || 'Classroom', 
        sub_category, 
        title, 
        location, 
        priority, 
        description 
      })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      showPageAlert('dashboard-global-alert', `Complaint registered successfully! ID: ${data.ticket_id}`, 'success');
      document.getElementById('form-complaint').reset();
      dismissDuplicateBox();
      setupZoneSubCategories();
      await loadComplaints();
      switchDashboardTab('my-complaints');
    } else {
      showPageAlert('dashboard-global-alert', data.message || 'Error submitting complaint.', 'error');
    }
  } catch (err) {
    console.error('Submission error:', err);
    showPageAlert('dashboard-global-alert', 'Network error. Please check server.', 'error');
  }
}

async function loadComplaints() {
  try {
    const res = await fetch('/api/complaints');
    const data = await res.json();
    if (res.ok && data.success) {
      renderRecentTable(data.complaints);
      if (currentUser.role === 'admin') {
        renderAdminTable(data.complaints);
      } else {
        renderStudentTable(data.complaints);
      }
    }
  } catch (err) {}
}

function renderRecentTable(list) {
  const tbody = document.getElementById('overview-recent-tbody');
  const recent = list.slice(0, 5);
  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">No complaints logged yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = recent.map(c => `
    <tr>
      <td><strong>${c.ticket_id}</strong></td>
      <td>${escapeHtml(c.zone)}</td>
      <td>${escapeHtml(c.title)}</td>
      <td>${escapeHtml(c.location)}</td>
      <td><span class="repentance-pill">🔥 Repeated: ${c.upvotes} Times</span></td>
      <td>${getStatusBadgeHtml(c.status)}</td>
      <td><button class="btn btn-outline btn-sm" onclick="trackFromTable('${c.ticket_id}')">Track</button></td>
    </tr>
  `).join('');
}

function renderStudentTable(list) {
  const tbody = document.getElementById('student-complaints-tbody');
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">You have no registered complaints.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(c => `
    <tr>
      <td><strong>${c.ticket_id}</strong></td>
      <td>${escapeHtml(c.zone)}</td>
      <td>${escapeHtml(c.title)}</td>
      <td>${escapeHtml(c.location)}</td>
      <td><span class="repentance-pill">🔥 Repeated: ${c.upvotes} Times</span></td>
      <td>${getStatusBadgeHtml(c.status)}</td>
      <td><button class="btn btn-outline btn-sm" onclick="trackFromTable('${c.ticket_id}')">Status</button></td>
    </tr>
  `).join('');
}

// ADMIN TABLE WITH CLUSTERED GROUPING & REPENTANCE HIGHLIGHT
function renderAdminTable(list) {
  const tbody = document.getElementById('admin-complaints-tbody');
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">No complaints in queue.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(c => `
    <tr>
      <td><strong>${c.ticket_id}</strong></td>
      <td>
        <strong>${escapeHtml(c.student_name || 'AM')}</strong><br>
        <small style="color: var(--text-muted);">${escapeHtml(c.student_roll || '')} | ${escapeHtml(c.student_year || '')} - ${escapeHtml(c.student_section || '')}</small>
      </td>
      <td><strong>${escapeHtml(c.zone)}</strong>: ${escapeHtml(c.location)}</td>
      <td>
        <div style="font-weight: 600;">${escapeHtml(c.title)}</div>
        <small style="color: var(--accent-blue);">${escapeHtml(c.sub_category)}</small>
      </td>
      <td>
        <span class="repentance-pill">🔥 Repeated: ${c.upvotes} Times</span>
      </td>
      <td>${getStatusBadgeHtml(c.status)}</td>
      <td>
        <select class="form-control" style="font-size: 0.8rem; padding: 2px 6px;" onchange="updateTicketStatusAdmin(${c.id}, this.value)">
          <option value="Submitted" ${c.status === 'Submitted' ? 'selected' : ''}>Submitted</option>
          <option value="Under Review" ${c.status === 'Under Review' ? 'selected' : ''}>Under Review</option>
          <option value="In Progress" ${c.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
          <option value="Resolved" ${c.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
        </select>
      </td>
    </tr>
  `).join('');
}

// LOAD ALL FEEDBACKS FOR ADMIN TAB
async function loadAdminFeedbacks() {
  try {
    const res = await fetch('/api/feedbacks/all');
    const data = await res.json();
    const tbody = document.getElementById('admin-feedbacks-tbody');
    if (!tbody) return;

    if (data.success && data.feedbacks.length > 0) {
      tbody.innerHTML = data.feedbacks.map(f => `
        <tr>
          <td><small>${f.created_at.split(' ')[0]}</small></td>
          <td><strong>${escapeHtml(f.student_name)}</strong><br><small style="color: var(--text-muted);">${escapeHtml(f.roll_number)} (${escapeHtml(f.department)})</small></td>
          <td><span class="badge badge-normal">${escapeHtml(f.zone)}</span></td>
          <td><span style="color: #F59E0B; font-weight: 700;">⭐ ${f.rating} / 5</span></td>
          <td>${escapeHtml(f.comments)}</td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No student feedback submitted yet.</td></tr>`;
    }
  } catch (err) {}
}

async function updateTicketStatusAdmin(complaintId, newStatus) {
  const remarks = prompt(`Enter administrative note for marking as "${newStatus}":`);
  try {
    const res = await fetch(`/api/complaints/${complaintId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, remarks: remarks || 'Status updated by administration.' })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showPageAlert('dashboard-global-alert', data.message, 'success');
      await loadComplaints();
    }
  } catch (err) {
    alert('Failed to update status.');
  }
}

async function lookupTicketStatus(targetId) {
  const query = targetId || document.getElementById('track-ticket-input').value.trim();
  if (!query) { alert('Enter Ticket ID'); return; }

  try {
    const res = await fetch(`/api/track/${encodeURIComponent(query)}`);
    const data = await res.json();
    const box = document.getElementById('ticket-result-box');

    if (!res.ok || !data.success) {
      alert(data.message);
      box.style.display = 'none';
      return;
    }

    const c = data.complaint;
    box.style.display = 'block';
    document.getElementById('tr-title').textContent = `${c.zone} (${c.sub_category}): ${c.title}`;
    document.getElementById('tr-ticket-id').textContent = `${c.ticket_id} • Location: ${c.location}`;
    document.getElementById('tr-badge-wrap').innerHTML = getStatusBadgeHtml(c.status);
    document.getElementById('tr-remarks').textContent = c.admin_remarks || 'Inspection in progress.';
    document.getElementById('tr-upvotes-count').textContent = `🔥 Repeated: ${c.upvotes} Times (${c.upvotes} Students affected)`;

    const steps = { 'Submitted': 1, 'Under Review': 2, 'In Progress': 3, 'Resolved': 4 };
    const curr = steps[c.status] || 1;
    for (let i = 1; i <= 4; i++) {
      const node = document.getElementById(`step-node-${i}`);
      node.className = 'step-node';
      if (i < curr) node.classList.add('completed');
      else if (i === curr) node.classList.add('current');
    }
  } catch (e) {
    alert('Network error tracking ticket.');
  }
}

function trackFromTable(ticketId) {
  switchDashboardTab('track-ticket');
  document.getElementById('track-ticket-input').value = ticketId;
  lookupTicketStatus(ticketId);
}

// Feedback & Profile
async function handleFeedbackSubmit(e) {
  e.preventDefault();
  const zone = document.getElementById('fb-zone').value;
  const rating = document.getElementById('fb-rating').value;
  const comments = document.getElementById('fb-comments').value.trim();

  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zone, rating, comments })
  });
  const data = await res.json();
  if (data.success) {
    showPageAlert('dashboard-global-alert', data.message, 'success');
    e.target.reset();
  }
}

async function handleProfileUpdate(e) {
  e.preventDefault();
  const name = document.getElementById('prof-name').value.trim() || 'AM';
  const phone = document.getElementById('prof-phone').value.trim();
  const section = document.getElementById('prof-section') ? document.getElementById('prof-section').value : '';
  const academic_year = document.getElementById('prof-year') ? document.getElementById('prof-year').value : '';

  const res = await fetch('/api/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone, section, academic_year })
  });
  const data = await res.json();
  if (data.success) {
    showPageAlert('dashboard-global-alert', data.message, 'success');
    initSession();
  }
}

async function handleLogout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = 'login.html';
}