function showPageAlert(elementId, message, type = 'error') {
  const alertEl = document.getElementById(elementId);
  if (!alertEl) return;
  alertEl.style.display = 'block';
  alertEl.style.backgroundColor = type === 'success' ? '#D1FAE5' : '#FEE2E2';
  alertEl.style.color = type === 'success' ? '#065F46' : '#991B1B';
  alertEl.style.border = `1px solid ${type === 'success' ? '#A7F3D0' : '#FECACA'}`;
  alertEl.textContent = message;

  setTimeout(() => {
    alertEl.style.display = 'none';
  }, 4500);
}

function getStatusBadgeHtml(status) {
  const s = (status || '').toLowerCase();
  if (s === 'submitted') return `<span class="badge badge-pending">Submitted</span>`;
  if (s === 'under review') return `<span class="badge badge-pending">Under Review</span>`;
  if (s === 'in progress') return `<span class="badge badge-progress">In Progress</span>`;
  if (s === 'resolved') return `<span class="badge badge-resolved">Resolved</span>`;
  return `<span class="badge">${status}</span>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}