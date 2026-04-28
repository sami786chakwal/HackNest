const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const path = require('path');
const { sql, poolPromise } = require('../db');

// Middleware: Guard for protected routes
const checkAuth = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/login');
};

// --- VIEW ROUTES ---

router.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/register.html'));
});

router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.sendFile(path.join(__dirname, '../views/login.html'));
});

router.get('/dashboard', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../views/dashboard.html'));
});

// --- API ROUTES ---

// POST /register
router.post('/register', async (req, res) => {
    const { username, email, password, confirmPassword } = req.body;

    if (!username || !email || !password || !confirmPassword) {
        return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }
    if (password !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    try {
        const pool = await poolPromise;
        
        // Use a single query to check both
        const existing = await pool.request()
            .input('u', sql.NVarChar, username)
            .input('e', sql.NVarChar, email)
            .query('SELECT UserID FROM Users WHERE Username = @u OR Email = @e');

        if (existing.recordset.length > 0) {
            return res.status(409).json({ success: false, message: 'Identity already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 12); // Slightly higher cost for security

        await pool.request()
            .input('u', sql.NVarChar, username)
            .input('e', sql.NVarChar, email)
            .input('p', sql.NVarChar, hashedPassword)
            .query('INSERT INTO Users (Username, Email, Password, Score, Role) VALUES (@u, @e, @p, 0, "User")');

        res.json({ success: true, message: 'Account synchronized. Welcome.' });
    } catch (err) {
        console.error('Registration Error:', err);
        res.status(500).json({ success: false, message: 'Internal system fault.' });
    }
});

// POST /login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('u', sql.NVarChar, username)
            .query('SELECT * FROM Users WHERE Username = @u OR Email = @u');

        const user = result.recordset[0];
        if (!user || !(await bcrypt.compare(password, user.Password))) {
            return res.status(401).json({ success: false, message: 'Access denied. Invalid credentials.' });
        }

        // Initialize Session
        req.session.user = {
            id: user.UserID,
            username: user.Username,
            role: user.Role
        };

        res.json({ success: true, message: 'Authentication successful.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Connection failure.' });
    }
});

// GET /api/user-stats
router.get('/api/user-stats', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.session.user.id)
            .query(`
                SELECT Username, Score, Role,
                (SELECT COUNT(*) + 1 FROM Users WHERE Score > u.Score) as Rank,
                (SELECT COUNT(*) FROM Users WHERE IsHidden = 0) as TotalUsers
                FROM Users u WHERE UserID = @id
            `);

        res.json({ success: true, user: result.recordset[0] });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid'); // Clean up cookie on client
        res.redirect('/login');
    });
});

module.exports = router;