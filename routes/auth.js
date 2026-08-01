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

// GET / - Redirect to login
router.get('/', (req, res) => {
    res.redirect('/login');
});

router.get('/scoreboard', checkAuth, checkNotBanned, (req, res) => {
    res.sendFile(path.join(__dirname, '../views/scoreboard.html'));
});

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
    res.redirect(`/profile/${req.session.user.username}`);
});

router.get('/settings', checkAuth, checkNotBanned, (req, res) => {
    res.sendFile(path.join(__dirname, '../views/settings.html'));
});

router.get('/profile/:username', checkAuth, checkNotBanned, async (req, res) => {
    const { username } = req.params;
    const currentUsername = req.session.user?.username;

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('username', sql.NVarChar, username)
            .query('SELECT UserID, Username, ISNULL(IsHidden, 0) AS IsHidden FROM Users WHERE Username = @username');

        if (result.recordset.length === 0) {
            return res.status(404).sendFile(path.join(__dirname, '../views/404.html'));
        }

        const profileUser = result.recordset[0];
        if (profileUser.IsHidden && profileUser.Username.toLowerCase() !== String(currentUsername || '').toLowerCase()) {
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
            .query("INSERT INTO Users (Username, Email, Password, Score, Role) VALUES (@u, @e, @p, 0, 'User')");

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

        req.session.save((saveErr) => {
            if (saveErr) {
                console.error('Session save error:', saveErr);
                return res.status(500).json({ success: false, message: 'Failed to establish session.' });
            }
            res.json({ success: true, message: 'Authentication successful.' });
        });
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

// GET /api/user-settings
router.get('/api/user-settings', checkAuth, checkNotBanned, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.session.user.id)
            .query(`
                SELECT Username, Email, Role, CreatedAt AS MemberSince,
                       ISNULL(IsHidden, 0) AS IsHidden
                FROM Users
                WHERE UserID = @id
            `);

        res.json({ success: true, user: result.recordset[0] });
    } catch (err) {
        console.error('User settings fetch error:', err);
        res.status(500).json({ success: false, message: 'Failed to load settings.' });
    }
});

// PUT /api/user-settings
router.put('/api/user-settings', checkAuth, checkNotBanned, async (req, res) => {
    const { email, password, isHidden } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

    try {
        const pool = await poolPromise;
        const currentUserId = req.session.user.id;

        const existing = await pool.request()
            .input('id', sql.Int, currentUserId)
            .input('email', sql.NVarChar, email)
            .query('SELECT UserID FROM Users WHERE Email = @email AND UserID != @id');

        if (existing.recordset.length > 0) {
            return res.status(409).json({ success: false, message: 'Email is already in use.' });
        }

        let query = 'UPDATE Users SET Email = @email, IsHidden = @hidden';
        const request = pool.request()
            .input('id', sql.Int, currentUserId)
            .input('email', sql.NVarChar, email)
            .input('hidden', sql.Bit, isHidden ? 1 : 0);

        if (password) {
            const hashed = await bcrypt.hash(password, 12);
            query += ', Password = @password';
            request.input('password', sql.NVarChar, hashed);
        }

        query += ' WHERE UserID = @id';
        await request.query(query);

        res.json({ success: true, message: 'Settings updated successfully.' });
    } catch (err) {
        console.error('User settings update error:', err);
        res.status(500).json({ success: false, message: 'Failed to save settings.' });
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
    const currentUsername = req.session.user?.username;

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('username', sql.NVarChar, username)
            .query(`
                SELECT u.Username, u.Score, u.CreatedAt as MemberSince,
                ISNULL(u.IsHidden, 0) AS IsHidden,
                (SELECT COUNT(*) + 1 FROM Users WHERE Score > u.Score) as Rank,
                (SELECT COUNT(*) FROM Users WHERE IsHidden = 0) as TotalUsers,
                ISNULL(solved.ChallengesSolved, 0) as ChallengesSolved,
                ISNULL(solved.AverageScore, 0.0) as AverageScore,
                0 as Achievements
                FROM Users u
                LEFT JOIN (
                    SELECT s.UserID,
                           COUNT(s.SolveID) as ChallengesSolved,
                           AVG(c.Points) as AverageScore
                    FROM Solves s
                    JOIN Challenges c ON s.ChallengeID = c.ChallengeID
                    GROUP BY s.UserID
                ) solved ON u.UserID = solved.UserID
                WHERE u.Username = @username
            `);

        if (result.recordset.length === 0) {
            return res.json({ success: false, message: 'User not found or profile is private.' });
        }

        const profileUser = result.recordset[0];
        if (profileUser.IsHidden && profileUser.Username.toLowerCase() !== String(currentUsername || '').toLowerCase()) {
            return res.json({ success: false, message: 'User not found or profile is private.' });
        }

        delete profileUser.IsHidden;
        res.json({ success: true, user: profileUser });
    } catch (err) {
        console.error('User profile API error:', err);
        res.status(500).json({ success: false, message: 'Failed to load user profile.' });
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.clearCookie('hacknest.sid', { path: '/' }); // Clean up cookie on client
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
// GET /api/scoreboard
router.get('/api/scoreboard', checkAuth, checkNotBanned, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('uid', sql.Int, req.session.user.id)
            .query(`
                SELECT
                    ROW_NUMBER() OVER (ORDER BY Score DESC, CreatedAt ASC) AS Rank,
                    UserID,
                    Username,
                    Score,
                    Role,
                    CreatedAt,
                    (SELECT COUNT(*) FROM Solves WHERE UserID = u.UserID) AS SolveCount,
                    CASE WHEN UserID = @uid THEN 1 ELSE 0 END AS IsCurrentUser
                FROM Users u
                WHERE ISNULL(IsHidden, 0) = 0 AND ISNULL(IsBanned, 0) = 0
                ORDER BY Score DESC, CreatedAt ASC
            `);

        res.json({ success: true, scoreboard: result.recordset });
    } catch (err) {
        console.error('Scoreboard error:', err);
        res.status(500).json({ success: false, message: 'Failed to load scoreboard.' });
    }
});

module.exports = router;