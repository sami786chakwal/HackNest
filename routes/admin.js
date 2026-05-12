const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { sql, poolPromise } = require('../db');

// Import middleware from auth routes
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

// Middleware: Check if user is admin
const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role && req.session.user.role.toLowerCase() === 'admin') return next();
    res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
};

// GET /admin - Admin dashboard
router.get('/admin', checkAdmin, checkNotBanned, (req, res) => {
    res.sendFile(require('path').join(__dirname, '../views/admin-dashboard.html'));
});

// GET /admin/users - Admin user management
router.get('/admin/users', checkAdmin, checkNotBanned, (req, res) => {
    res.sendFile(require('path').join(__dirname, '../views/admin-users.html'));
});

// GET /api/admin/stats - Get admin statistics
router.get('/api/admin/stats', checkAdmin, checkNotBanned, async (req, res) => {
    try {
        const pool = await poolPromise;
        const userResult = await pool.request()
            .query(`
                SELECT
                    COUNT(*) as totalUsers,
                    SUM(CASE WHEN IsBanned = 0 AND IsHidden = 0 THEN 1 ELSE 0 END) as activeUsers,
                    SUM(CASE WHEN IsBanned = 1 THEN 1 ELSE 0 END) as bannedUsers,
                    SUM(CASE WHEN IsHidden = 1 THEN 1 ELSE 0 END) as hiddenUsers
                FROM Users
            `);

        const challengeResult = await pool.request()
            .query(`
                SELECT
                    COUNT(*) as totalChallenges,
                    SUM(CASE WHEN IsActive = 1 THEN 1 ELSE 0 END) as activeChallenges
                FROM Challenges
            `);

        const solveResult = await pool.request()
            .query(`SELECT COUNT(*) as totalSolves FROM Solves`);

        const stats = {
            ...userResult.recordset[0],
            ...challengeResult.recordset[0],
            ...solveResult.recordset[0]
        };

        res.json({ success: true, stats });
    } catch (err) {
        console.error('Admin stats error:', err);
        res.status(500).json({ success: false, message: 'Failed to load statistics.' });
    }
});

// GET /api/admin/recent-solves - Get the latest user solves for live activity
router.get('/api/admin/recent-solves', checkAdmin, checkNotBanned, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query(`
                SELECT TOP 8
                    s.SolveID,
                    s.UserID,
                    u.Username,
                    s.ChallengeID,
                    c.Title AS ChallengeTitle,
                    s.SolvedAt,
                    c.Points
                FROM Solves s
                INNER JOIN Users u ON u.UserID = s.UserID
                INNER JOIN Challenges c ON c.ChallengeID = s.ChallengeID
                ORDER BY s.SolvedAt DESC
            `);

        res.json({ success: true, solves: result.recordset });
    } catch (err) {
        console.error('Admin recent solves error:', err);
        res.status(500).json({ success: false, message: 'Failed to load recent activity.' });
    }
});

// GET /api/admin/users - Get all users for admin
router.get('/api/admin/users', checkAdmin, checkNotBanned, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query(`
                SELECT UserID, Username, Email, Role, Score,
                       ISNULL(IsBanned, 0) as IsBanned,
                       ISNULL(IsHidden, 0) as IsHidden,
                       CreatedAt
                FROM Users
                ORDER BY UserID
            `);

        res.json({ success: true, users: result.recordset });
    } catch (err) {
        console.error('Admin users error:', err);
        res.status(500).json({ success: false, message: 'Failed to load users.' });
    }
});

// POST /api/admin/users - Create new user
router.post('/api/admin/users', checkAdmin, checkNotBanned, async (req, res) => {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    try {
        const pool = await poolPromise;

        // Check if user already exists
        const existing = await pool.request()
            .input('u', sql.NVarChar, username)
            .input('e', sql.NVarChar, email)
            .query('SELECT UserID FROM Users WHERE Username = @u OR Email = @e');

        if (existing.recordset.length > 0) {
            return res.status(409).json({ success: false, message: 'Username or email already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        await pool.request()
            .input('u', sql.NVarChar, username)
            .input('e', sql.NVarChar, email)
            .input('p', sql.NVarChar, hashedPassword)
            .input('r', sql.NVarChar, role || 'User')
            .query(`
                INSERT INTO Users (Username, Email, Password, Role, Score, IsBanned, IsHidden)
                VALUES (@u, @e, @p, @r, 0, 0, 0)
            `);

        res.json({ success: true, message: 'User created successfully.' });
    } catch (err) {
        console.error('Create user error:', err);
        res.status(500).json({ success: false, message: 'Failed to create user.' });
    }
});

// PUT /api/admin/users - Update user
router.put('/api/admin/users', checkAdmin, checkNotBanned, async (req, res) => {
    const { userId, username, email, password, role, score, isBanned, isHidden } = req.body;

    if (!userId || !username || !email) {
        return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    try {
        const pool = await poolPromise;

        // Check if another user has this username/email
        const existing = await pool.request()
            .input('id', sql.Int, userId)
            .input('u', sql.NVarChar, username)
            .input('e', sql.NVarChar, email)
            .query('SELECT UserID FROM Users WHERE (Username = @u OR Email = @e) AND UserID != @id');

        if (existing.recordset.length > 0) {
            return res.status(409).json({ success: false, message: 'Username or email already exists.' });
        }

        let query = `
            UPDATE Users
            SET Username = @u, Email = @e, Role = @r, Score = @s, IsBanned = @b, IsHidden = @h
        `;
        let request = pool.request()
            .input('id', sql.Int, userId)
            .input('u', sql.NVarChar, username)
            .input('e', sql.NVarChar, email)
            .input('r', sql.NVarChar, role)
            .input('s', sql.Int, score)
            .input('b', sql.Bit, isBanned || false)
            .input('h', sql.Bit, isHidden || false);

        // Only update password if provided
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 12);
            query += ', Password = @p';
            request.input('p', sql.NVarChar, hashedPassword);
        }

        query += ' WHERE UserID = @id';
        await request.query(query);

        res.json({ success: true, message: 'User updated successfully.' });
    } catch (err) {
        console.error('Update user error:', err);
        res.status(500).json({ success: false, message: 'Failed to update user.' });
    }
});

// PATCH /api/admin/users/:id/ban - Toggle ban status
router.patch('/api/admin/users/:id/ban', checkAdmin, checkNotBanned, async (req, res) => {
    const userId = req.params.id;

    try {
        const pool = await poolPromise;

        // Get current ban status
        const current = await pool.request()
            .input('id', sql.Int, userId)
            .query('SELECT IsBanned FROM Users WHERE UserID = @id');

        if (current.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const newStatus = current.recordset[0].IsBanned ? 0 : 1;

        await pool.request()
            .input('id', sql.Int, userId)
            .input('status', sql.Bit, newStatus)
            .query('UPDATE Users SET IsBanned = @status WHERE UserID = @id');

        res.json({
            success: true,
            message: `User ${newStatus ? 'banned' : 'unbanned'} successfully.`,
            isBanned: newStatus
        });
    } catch (err) {
        console.error('Toggle ban error:', err);
        res.status(500).json({ success: false, message: 'Failed to toggle ban status.' });
    }
});

// PATCH /api/admin/users/:id/hide - Toggle hide status
router.patch('/api/admin/users/:id/hide', checkAdmin, checkNotBanned, async (req, res) => {
    const userId = req.params.id;

    try {
        const pool = await poolPromise;

        // Get current hide status
        const current = await pool.request()
            .input('id', sql.Int, userId)
            .query('SELECT IsHidden FROM Users WHERE UserID = @id');

        if (current.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const newStatus = current.recordset[0].IsHidden ? 0 : 1;

        await pool.request()
            .input('id', sql.Int, userId)
            .input('status', sql.Bit, newStatus)
            .query('UPDATE Users SET IsHidden = @status WHERE UserID = @id');

        res.json({
            success: true,
            message: `User ${newStatus ? 'hidden' : 'shown'} successfully.`,
            isHidden: newStatus
        });
    } catch (err) {
        console.error('Toggle hide error:', err);
        res.status(500).json({ success: false, message: 'Failed to toggle hide status.' });
    }
});

// DELETE /api/admin/users/:id - Delete user
router.delete('/api/admin/users/:id', checkAdmin, checkNotBanned, async (req, res) => {
    const userId = req.params.id;

    try {
        const pool = await poolPromise;

        await pool.request()
            .input('id', sql.Int, userId)
            .query('DELETE FROM Users WHERE UserID = @id');

        res.json({ success: true, message: 'User deleted successfully.' });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ success: false, message: 'Failed to delete user.' });
    }
});

module.exports = router;