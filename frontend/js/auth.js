let activeSignupRole = 'student';

function setSignupRole(role) {
  activeSignupRole = role;
  document.getElementById('tab-role-student').classList.toggle('active', role === 'student');
  document.getElementById('tab-role-admin').classList.toggle('active', role === 'admin');

  document.getElementById('student-fields').style.display = role === 'student' ? 'block' : 'none';
  document.getElementById('admin-fields').style.display = role === 'admin' ? 'block' : 'none';
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const submitBtn = document.getElementById('btn-login-submit');

  submitBtn.disabled = true;
  submitBtn.textContent = 'Authenticating...';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      window.location.href = 'dashboard.html';
    } else {
      showPageAlert('login-alert', data.message || 'Login failed.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Authorize & Sign In';
    }
  } catch (err) {
    showPageAlert('login-alert', 'Network error. Please check server.');
    submitBtn.disabled = false;
  }
}

async function handleSignupSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim() || 'AM';
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-pass').value;
  const confirm_password = document.getElementById('reg-confirm-pass').value;

  if (password !== confirm_password) {
    showPageAlert('signup-alert', 'Passwords do not match.');
    return;
  }

  let roll_number = 'N/A';
  let admin_id = 'N/A';
  let department = '';
  let section = 'N/A';
  let academic_year = 'N/A';

  if (activeSignupRole === 'student') {
    roll_number = document.getElementById('reg-roll').value.trim();
    department = document.getElementById('reg-dept').value;
    section = document.getElementById('reg-section').value;
    academic_year = document.getElementById('reg-year').value;
  } else {
    admin_id = document.getElementById('reg-admin-id').value.trim();
    department = document.getElementById('reg-admin-dept').value;
  }

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        password,
        confirm_password,
        role: activeSignupRole,
        roll_number,
        admin_id,
        department,
        section,
        academic_year
      })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      window.location.href = 'dashboard.html';
    } else {
      showPageAlert('signup-alert', data.message || 'Registration failed.');
    }
  } catch (err) {
    showPageAlert('signup-alert', 'Network error. Please try again.');
  }
}