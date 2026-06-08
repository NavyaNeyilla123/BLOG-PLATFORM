const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();

const app = express();

// A robust secret key for local development tokens
const JWT_SECRET = 'local_platform_dev_secret_2026';

// --- CORS CONFIGURATION ---
app.use(cors({
    origin: ['http://127.0.0.1:5500', 'http://localhost:5500', 'http://127.0.0.1:5000', 'http://localhost:5000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Serve Frontend Static Files automatically
app.use(express.static(path.join(__dirname, '../frontend')));

// --- INITIALIZE LOCAL SQLITE DATABASE ---
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('❌ Error opening local SQLite database:', err.message);
    else console.log('📦 Connected to local SQLite database successfully!');
});

// --- AUTOMATICALLY INSTANTIATE TABLES ---
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    )`);
});

// Unique ID Generator Helper
const generateId = () => Math.random().toString(36).substring(2, 15);

// Authentication Guard Middleware
const protect = (req, res, next) => {
    const token = req.header('Authorization')?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Access Denied: Log in first' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) { 
        res.status(403).json({ message: 'Session Expired or Invalid Token' }); 
    }
};

// --- AUTH API ROUTES ---
app.post('/api/auth/register', (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ message: 'All fields are required' });

    db.get(`SELECT id FROM users WHERE email = ? OR username = ?`, [email, username], async (err, row) => {
        if (err) return res.status(500).json({ message: err.message });
        if (row) return res.status(400).json({ message: 'Username or Email is already registered' });

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const userId = generateId();
            db.run(`INSERT INTO users (id, username, email, password) VALUES (?, ?, ?, ?)`, 
                [userId, username, email, hashedPassword], (insertErr) => {
                    if (insertErr) return res.status(400).json({ message: insertErr.message });
                    res.status(201).json({ message: 'User registered successfully!' });
                });
        } catch (e) { res.status(500).json({ message: e.message }); }
    });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err) return res.status(500).json({ message: err.message });
        if (!user) return res.status(400).json({ message: 'User credentials not found' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Incorrect Password' });

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '2h' });
        res.json({ token, username: user.username });
    });
});

// --- POST API ROUTES ---
app.get('/api/posts', (req, res) => {
    db.all(`SELECT * FROM posts ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows);
    });
});

app.post('/api/posts', protect, (req, res) => {
    const { title, content } = req.body;
    const postId = generateId();
    db.run(`INSERT INTO posts (id, title, content, author_id, author_name) VALUES (?, ?, ?, ?, ?)`,
        [postId, title, content, req.user.id, req.user.username], (err) => {
            if (err) return res.status(400).json({ message: err.message });
            res.status(201).json({ message: 'Post created successfully!' });
        });
});

app.delete('/api/posts/:id', protect, (req, res) => {
    db.get(`SELECT author_id FROM posts WHERE id = ?`, [req.params.id], (err, post) => {
        if (err) return res.status(500).json({ message: err.message });
        if (!post) return res.status(404).json({ message: 'Post not found' });
        if (post.author_id !== req.user.id) return res.status(403).json({ message: 'Unauthorized' });

        db.run(`DELETE FROM posts WHERE id = ?`, [req.params.id], (delErr) => {
            if (delErr) return res.status(400).json({ message: delErr.message });
            res.json({ message: 'Post dropped successfully' });
        });
    });
});

// --- COMMENT API ROUTES ---
app.get('/api/comments/:postId', (req, res) => {
    db.all(`SELECT * FROM comments WHERE post_id = ? ORDER BY created_at DESC`, [req.params.postId], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows);
    });
});

app.post('/api/comments', (req, res) => {
    const { postId, authorName, text } = req.body;
    const commentId = generateId();
    db.run(`INSERT INTO comments (id, post_id, author_name, text) VALUES (?, ?, ?, ?)`,
        [commentId, postId, authorName, text], (err) => {
            if (err) return res.status(400).json({ message: err.message });
            res.status(201).json({ message: 'Comment posted' });
        });
});

// Static SPA fallback route handler
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));

const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Server running perfectly on port ${PORT}`));