import os
import re
import random
import string
import sqlite3
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, session, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, '..', 'frontend'))
DB_PATH = os.path.join(BASE_DIR, 'smart_cms.db')

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
app.secret_key = os.environ.get('SECRET_KEY', 'smart-cms-enterprise-token-2025')

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    SESSION_COOKIE_SECURE=False
)

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 1. Users Table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('student', 'admin')),
                roll_number TEXT DEFAULT 'N/A',
                admin_id TEXT DEFAULT 'N/A',
                department TEXT NOT NULL,
                section TEXT DEFAULT 'N/A',
                academic_year TEXT DEFAULT 'N/A',
                phone TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # 2. Complaints Table with Zone, Sub-category, Upvotes & Deadline
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS complaints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id TEXT UNIQUE NOT NULL,
                user_id INTEGER NOT NULL,
                zone TEXT NOT NULL,
                sub_category TEXT NOT NULL,
                title TEXT NOT NULL,
                location TEXT NOT NULL,
                description TEXT NOT NULL,
                priority TEXT NOT NULL CHECK(priority IN ('Normal', 'High', 'Urgent')),
                status TEXT NOT NULL DEFAULT 'Submitted' CHECK(status IN ('Submitted', 'Under Review', 'In Progress', 'Resolved', 'Rejected')),
                upvotes INTEGER DEFAULT 1,
                deadline TIMESTAMP,
                admin_remarks TEXT DEFAULT 'Complaint registered. Department dispatched for inspection.',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ''')

        # 3. Upvotes Log
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS complaint_upvotes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                complaint_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(complaint_id, user_id),
                FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ''')

        # 4. Campus Notices Table (24-Hour Auto-Expiry)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS notices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                posted_by TEXT NOT NULL,
                priority TEXT NOT NULL DEFAULT 'Normal',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL
            )
        ''')

        # 5. Feedback Table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                zone TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
                comments TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ''')
        conn.commit()

init_db()

# Decorators
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Authentication required. Please sign in.'}), 401
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session or session.get('role') != 'admin':
            return jsonify({'success': False, 'message': 'Admin authority required.'}), 403
        return f(*args, **kwargs)
    return decorated

def generate_ticket_code(zone):
    prefix = re.sub(r'[^A-Z]', '', zone.upper())[:4]
    if len(prefix) < 3: prefix = "CAMP"
    date_part = datetime.now().strftime('%Y%m')
    rand_chars = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"CMS-{date_part}-{prefix}-{rand_chars}"

def calculate_deadline(priority):
    now = datetime.now()
    if priority == 'Urgent':
        return (now + timedelta(hours=12)).strftime('%Y-%m-%d %H:%M:%S')
    elif priority == 'High':
        return (now + timedelta(hours=24)).strftime('%Y-%m-%d %H:%M:%S')
    return (now + timedelta(hours=72)).strftime('%Y-%m-%d %H:%M:%S')

# Web Page Routes
@app.route('/')
def serve_index(): return send_from_directory(FRONTEND_DIR, 'index.html')
@app.route('/login')
@app.route('/login.html')
def serve_login(): return send_from_directory(FRONTEND_DIR, 'login.html')
@app.route('/signup')
@app.route('/signup.html')
def serve_signup(): return send_from_directory(FRONTEND_DIR, 'signup.html')
@app.route('/dashboard')
@app.route('/dashboard.html')
def serve_dashboard(): return send_from_directory(FRONTEND_DIR, 'dashboard.html')
@app.route('/<path:filename>')
def serve_static(filename): return send_from_directory(FRONTEND_DIR, filename)

# ----------------- AUTHENTICATION -----------------

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    name = data.get('name', '').strip() or 'AM'
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    confirm_password = data.get('confirm_password', '')
    role = data.get('role', 'student').strip().lower()
    department = data.get('department', '').strip()
    
    roll_number = data.get('roll_number', 'N/A').strip() if role == 'student' else 'N/A'
    section = data.get('section', 'N/A').strip() if role == 'student' else 'N/A'
    academic_year = data.get('academic_year', 'N/A').strip() if role == 'student' else 'N/A'
    admin_id = data.get('admin_id', 'N/A').strip() if role == 'admin' else 'N/A'

    if not email or not password or not department:
        return jsonify({'success': False, 'message': 'Please fill all required fields.'}), 400

    if role == 'student' and (not roll_number or roll_number == 'N/A'):
        return jsonify({'success': False, 'message': 'Roll Number is required for students.'}), 400

    if role == 'admin' and (not admin_id or admin_id == 'N/A'):
        return jsonify({'success': False, 'message': 'Admin ID is required for teachers/admins.'}), 400

    if len(password) < 6:
        return jsonify({'success': False, 'message': 'Password must be at least 6 characters.'}), 400

    if password != confirm_password:
        return jsonify({'success': False, 'message': 'Passwords do not match.'}), 400

    hashed_pw = generate_password_hash(password)

    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO users (name, email, password_hash, role, roll_number, admin_id, department, section, academic_year)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (name, email, hashed_pw, role, roll_number, admin_id, department, section, academic_year))
            conn.commit()
            uid = cursor.lastrowid

            session['user_id'] = uid
            session['name'] = name
            session['email'] = email
            session['role'] = role
            session['department'] = department
            session['roll_number'] = roll_number
            session['admin_id'] = admin_id
            session['section'] = section
            session['academic_year'] = academic_year

            return jsonify({'success': True, 'message': 'Registration successful!'}), 201
    except sqlite3.IntegrityError:
        return jsonify({'success': False, 'message': 'This campus email is already registered.'}), 409

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
        user = cursor.fetchone()

        if not user or not check_password_hash(user['password_hash'], password):
            return jsonify({'success': False, 'message': 'Invalid campus credentials.'}), 401

        session['user_id'] = user['id']
        session['name'] = user['name']
        session['email'] = user['email']
        session['role'] = user['role']
        session['department'] = user['department']
        session['roll_number'] = user['roll_number']
        session['admin_id'] = user['admin_id']
        session['section'] = user['section']
        session['academic_year'] = user['academic_year']

        return jsonify({'success': True, 'message': 'Signed in successfully!'})

@app.route('/api/me', methods=['GET'])
def get_current_user():
    if 'user_id' not in session:
        return jsonify({'authenticated': False})
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, email, role, roll_number, admin_id, department, section, academic_year, phone, created_at FROM users WHERE id = ?", (session['user_id'],))
        u = cursor.fetchone()
        return jsonify({'authenticated': True, 'user': dict(u)})

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

# ----------------- COMPLAINTS ENGINE -----------------

@app.route('/api/complaints/check-duplicate', methods=['POST'])
def check_duplicate():
    data = request.get_json() or {}
    zone = data.get('zone', '').strip()
    title = data.get('title', '').strip().lower()

    if not zone or len(title) < 4:
        return jsonify({'found': False})

    keywords = [w for w in re.split(r'\W+', title) if len(w) > 3]

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, ticket_id, title, location, upvotes, status, created_at
            FROM complaints
            WHERE zone = ? AND status IN ('Submitted', 'Under Review', 'In Progress')
            ORDER BY upvotes DESC LIMIT 10
        ''', (zone,))
        active_tickets = cursor.fetchall()

        matched = []
        for t in active_tickets:
            t_title = t['title'].lower()
            matches = sum(1 for kw in keywords if kw in t_title)
            if matches >= 1:
                matched.append(dict(t))

        if matched:
            return jsonify({'found': True, 'matches': matched[:3]})
        return jsonify({'found': False})

@app.route('/api/complaints/<int:complaint_id>/upvote', methods=['POST'])
@login_required
def upvote_complaint(complaint_id):
    user_id = session['user_id']
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO complaint_upvotes (complaint_id, user_id) VALUES (?, ?)
            ''', (complaint_id, user_id))
            cursor.execute('''
                UPDATE complaints SET upvotes = upvotes + 1 WHERE id = ?
            ''', (complaint_id,))
            conn.commit()
            return jsonify({'success': True, 'message': 'Upvote (+1) recorded. Impact count escalated!'})
    except sqlite3.IntegrityError:
        return jsonify({'success': False, 'message': 'You have already upvoted this complaint.'}), 400

@app.route('/api/complaints', methods=['GET'])
@login_required
def get_complaints():
    user_id = session['user_id']
    role = session['role']

    with get_db() as conn:
        cursor = conn.cursor()
        if role == 'admin':
            # Sorted by highest upvotes/repetition count first
            cursor.execute('''
                SELECT c.*, u.name as student_name, u.email as student_email, u.roll_number as student_roll, 
                       u.section as student_section, u.academic_year as student_year, u.department as student_dept
                FROM complaints c JOIN users u ON c.user_id = u.id ORDER BY c.upvotes DESC, c.created_at DESC
            ''')
        else:
            cursor.execute('''
                SELECT DISTINCT c.* FROM complaints c
                LEFT JOIN complaint_upvotes cu ON c.id = cu.complaint_id
                WHERE c.user_id = ? OR cu.user_id = ?
                ORDER BY c.created_at DESC
            ''', (user_id, user_id))

        complaints = [dict(row) for row in cursor.fetchall()]
        return jsonify({'success': True, 'complaints': complaints})

@app.route('/api/complaints', methods=['POST'])
@login_required
def create_complaint():
    user_id = session['user_id']
    data = request.get_json() or {}

    zone = data.get('zone', 'Classroom').strip()
    sub_category = data.get('sub_category', 'General Concern').strip()
    title = data.get('title', '').strip()
    location = data.get('location', '').strip()
    description = data.get('description', '').strip()
    priority = data.get('priority', 'Normal').strip()

    if not title or not location or not description:
        return jsonify({'success': False, 'message': 'Please fill all required complaint fields.'}), 400

    ticket_id = generate_ticket_code(zone)
    deadline = calculate_deadline(priority)

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO complaints (ticket_id, user_id, zone, sub_category, title, location, description, priority, deadline, status, admin_remarks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Submitted', 'Complaint registered. Department dispatched for inspection.')
        ''', (ticket_id, user_id, zone, sub_category, title, location, description, priority, deadline))
        complaint_id = cursor.lastrowid
        
        cursor.execute("INSERT INTO complaint_upvotes (complaint_id, user_id) VALUES (?, ?)", (complaint_id, user_id))
        conn.commit()

        return jsonify({'success': True, 'message': 'Complaint registered successfully!', 'ticket_id': ticket_id}), 201

@app.route('/api/track/<ticket_id>', methods=['GET'])
def track_ticket(ticket_id):
    ticket_id = ticket_id.strip().upper()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT c.*, u.name as student_name, u.department as student_dept
            FROM complaints c JOIN users u ON c.user_id = u.id
            WHERE UPPER(c.ticket_id) = ?
        ''', (ticket_id,))
        c = cursor.fetchone()
        if not c:
            return jsonify({'success': False, 'message': f'Ticket Reference "{ticket_id}" not found.'}), 404
        return jsonify({'success': True, 'complaint': dict(c)})

@app.route('/api/complaints/<int:complaint_id>/status', methods=['PATCH'])
@admin_required
def update_status(complaint_id):
    data = request.get_json() or {}
    new_status = data.get('status', '').strip()
    remarks = data.get('remarks', '').strip()
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    with get_db() as conn:
        cursor = conn.cursor()
        if remarks:
            cursor.execute("UPDATE complaints SET status = ?, admin_remarks = ?, updated_at = ? WHERE id = ?",
                           (new_status, remarks, now_str, complaint_id))
        else:
            cursor.execute("UPDATE complaints SET status = ?, updated_at = ? WHERE id = ?",
                           (new_status, now_str, complaint_id))
        conn.commit()
        return jsonify({'success': True, 'message': f'Ticket updated to {new_status}.'})

# ----------------- 24-HOUR NOTICES -----------------

@app.route('/api/notices', methods=['GET'])
def get_notices():
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM notices WHERE expires_at < ?", (now_str,))
        conn.commit()

        cursor.execute("SELECT * FROM notices ORDER BY created_at DESC")
        notices = [dict(row) for row in cursor.fetchall()]
        return jsonify({'success': True, 'notices': notices})

@app.route('/api/notices', methods=['POST'])
@admin_required
def post_notice():
    data = request.get_json() or {}
    title = data.get('title', '').strip()
    content = data.get('content', '').strip()
    priority = data.get('priority', 'Normal').strip()

    if not title or not content:
        return jsonify({'success': False, 'message': 'Notice title and content are required.'}), 400

    now = datetime.now()
    expires_at = (now + timedelta(hours=24)).strftime('%Y-%m-%d %H:%M:%S')
    posted_by = session.get('name', 'Campus Administration')

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO notices (title, content, posted_by, priority, expires_at)
            VALUES (?, ?, ?, ?, ?)
        ''', (title, content, posted_by, priority, expires_at))
        conn.commit()

        return jsonify({'success': True, 'message': 'Notice broadcasted! Will auto-expire in 24 hours.'}), 201

# ----------------- FEEDBACK API (STUDENT SUBMIT & ADMIN VIEW) -----------------

@app.route('/api/feedback', methods=['POST'])
@login_required
def submit_feedback():
    data = request.get_json() or {}
    zone = data.get('zone', 'General Support').strip()
    comments = data.get('comments', '').strip()
    rating = int(data.get('rating', 5))

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO feedback (user_id, zone, rating, comments) VALUES (?, ?, ?, ?)",
                       (session['user_id'], zone, rating, comments))
        conn.commit()
        return jsonify({'success': True, 'message': 'Thank you! Feedback recorded.'}), 201

# Get all feedbacks for Admin Panel
@app.route('/api/feedbacks/all', methods=['GET'])
@admin_required
def get_all_feedbacks():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT f.id, f.zone, f.rating, f.comments, f.created_at, u.name as student_name, u.email as student_email, u.roll_number, u.department
            FROM feedback f
            JOIN users u ON f.user_id = u.id
            ORDER BY f.created_at DESC
        ''')
        feedbacks = [dict(row) for row in cursor.fetchall()]
        return jsonify({'success': True, 'feedbacks': feedbacks})

# Profile Update
@app.route('/api/profile', methods=['PATCH'])
@login_required
def update_profile():
    data = request.get_json() or {}
    name = data.get('name', '').strip() or 'AM'
    phone = data.get('phone', '').strip()
    section = data.get('section', '').strip()
    academic_year = data.get('academic_year', '').strip()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE users SET name = ?, phone = ?, section = ?, academic_year = ? WHERE id = ?
        ''', (name, phone, section, academic_year, session['user_id']))
        conn.commit()
        session['name'] = name
        return jsonify({'success': True, 'message': 'Profile updated successfully.'})

if __name__ == '__main__':
    print("==================================================")
    print(" Smart CMS Enterprise Edition running at: ")
    print(" http://127.0.0.1:5000")
    print("==================================================")
    app.run(host='127.0.0.1', port=5000, debug=True)