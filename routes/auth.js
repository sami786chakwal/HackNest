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

// Middleware: Check if user is banned
const checkNotBanned = async (req, res, next) => {
    if (!req.session.user) return next();

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.session.user.id)
            .query('SELECT IsBanned FROM Users WHERE UserID = @id');

        if (result.recordset.length > 0 && result.recordset[0].IsBanned) {
            // User is banned, show banned page
            return res.sendFile(require('path').join(__dirname, '../views/banned.html'));
        }

        next();
    } catch (err) {
        console.error('Ban check error:', err);
        next();
    }
};

// --- VIEW ROUTES ---

router.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/register.html'));
});

router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.sendFile(path.join(__dirname, '../views/login.html'));
});

router.get('/dashboard', checkAuth, checkNotBanned, (req, res) => {
    res.sendFile(path.join(__dirname, '../views/dashboard.html'));
});

router.get('/users', checkAuth, checkNotBanned, (req, res) => {
    res.sendFile(path.join(__dirname, '../views/users.html'));
});

router.get('/profile', checkAuth, checkNotBanned, (req, res) => {
    res.sendFile(path.join(__dirname, '../views/profile.html'));
});

router.get('/profile/:username', checkAuth, checkNotBanned, async (req, res) => {
    const { username } = req.params;

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('username', sql.NVarChar, username)
            .query('SELECT UserID FROM Users WHERE Username = @username AND ISNULL(IsHidden, 0) = 0');

        if (result.recordset.length === 0) {
            return res.status(404).sendFile(path.join(__dirname, '../views/404.html'));
        }

        // Serve the user profile page
        res.sendFile(path.join(__dirname, '../views/user-profile.html'));
    } catch (err) {
        console.error('Profile route error:', err);
        res.status(500).sendFile(path.join(__dirname, '../views/404.html'));
    }
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

// GET /api/user-profile
router.get('/api/user-profile', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.session.user.id)
            .query(`
                SELECT Username, Score, Role, CreatedAt as MemberSince,
                (SELECT COUNT(*) + 1 FROM Users WHERE Score > u.Score) as Rank,
                (SELECT COUNT(*) FROM Users WHERE IsHidden = 0) as TotalUsers,
                0 as ChallengesSolved, 0.0 as AverageScore, 0 as Achievements
                FROM Users u WHERE UserID = @id
            `);

        res.json({ success: true, user: result.recordset[0] });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// GET /api/user-profile/:username - Get public profile data for a user
router.get('/api/user-profile/:username', checkAuth, checkNotBanned, async (req, res) => {
    const { username } = req.params;

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('username', sql.NVarChar, username)
            .query(`
                SELECT Username, Score, CreatedAt as MemberSince,
                (SELECT COUNT(*) + 1 FROM Users WHERE Score > u.Score) as Rank,
                (SELECT COUNT(*) FROM Users WHERE IsHidden = 0) as TotalUsers,
                0 as ChallengesSolved, 0.0 as AverageScore, 0 as Achievements
                FROM Users u
                WHERE Username = @username AND ISNULL(IsHidden, 0) = 0
            `);

        if (result.recordset.length === 0) {
            return res.json({ success: false, message: 'User not found or profile is private.' });
        }

        res.json({ success: true, user: result.recordset[0] });
    } catch (err) {
        console.error('User profile API error:', err);
        res.status(500).json({ success: false, message: 'Failed to load user profile.' });
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid'); // Clean up cookie on client
        res.redirect('/login');
    });
});

// GET /api/all-users - Supports searching via ?search=
router.get('/api/all-users', checkAuth, checkNotBanned, async (req, res) => {
    const { search } = req.query; // Get the search term from URL query

    try {
        const pool = await poolPromise;
        let query = 'SELECT Username FROM Users WHERE ISNULL(IsHidden, 0) = 0';
        const request = pool.request();

        // If a search term exists, add the WHERE LIKE clause
        if (search) {
            query += ' AND Username LIKE @search';
            request.input('search', sql.NVarChar, `%${search}%`); // SQL LIKE syntax
        }

        const result = await request.query(query);
        res.json({ success: true, users: result.recordset });
    } catch (err) {
        console.error('All Users API Error:', err);
        res.status(500).json({ success: false, message: 'Unable to fetch users.' });
    }
});

module.exports = router;