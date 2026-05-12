const express = require('express');
const router  = express.Router();
const path    = require('path');
const { sql, poolPromise } = require('../db');

// ── Shared Middleware ───────────────────────────────────────────────────────

const checkAuth = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/login');
};

const checkNotBanned = async (req, res, next) => {
    if (!req.session.user) return next();
    try {
        const pool = await poolPromise;
        const r = await pool.request()
            .input('id', sql.Int, req.session.user.id)
            .query('SELECT IsBanned FROM Users WHERE UserID = @id');
        if (r.recordset[0]?.IsBanned)
            return res.sendFile(path.join(__dirname, '../views/banned.html'));
        next();
    } catch { next(); }
};

const checkAdmin = (req, res, next) => {
    if (req.session.user?.role?.toLowerCase() === 'admin') return next();
    res.status(403).json({ success: false, message: 'Admin access required.' });
};

// ── View Routes ─────────────────────────────────────────────────────────────

router.get('/notifications', checkAuth, checkNotBanned, (req, res) => {
    res.sendFile(path.join(__dirname, '../views/notifications.html'));
});

router.get('/admin/notifications', checkAdmin, checkNotBanned, (req, res) => {
    res.sendFile(path.join(__dirname, '../views/admin-notifications.html'));
});

// ── User API ────────────────────────────────────────────────────────────────

// GET /api/notifications — get all active notifications for current user
// includes whether each one has been read by this user
router.get('/api/notifications', checkAuth, checkNotBanned, async (req, res) => {
    const uid = req.session.user.id;
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('uid', sql.Int, uid)
            .query(`
                SELECT
                    n.NotificationID, n.Title, n.Message, n.Type,
                    n.CreatedAt, n.IsActive,
                    u.Username AS SentBy,
                    CASE WHEN nr.ReadID IS NOT NULL THEN 1 ELSE 0 END AS IsRead,
                    nr.ReadAt
                FROM Notifications n
                INNER JOIN Users u ON u.UserID = n.CreatedBy
                LEFT JOIN NotificationReads nr
                    ON nr.NotificationID = n.NotificationID AND nr.UserID = @uid
                WHERE n.IsActive = 1
                ORDER BY n.CreatedAt DESC
            `);
        res.json({ success: true, notifications: result.recordset });
    } catch (err) {
        console.error('Notifications fetch error:', err);
        res.status(500).json({ success: false, message: 'Failed to load notifications.' });
    }
});

// GET /api/notifications/unread-count — lightweight poll for badge + popup
router.get('/api/notifications/unread-count', checkAuth, async (req, res) => {
    const uid = req.session.user.id;
    try {
        const pool = await poolPromise;

        // Unread count
        const countRes = await pool.request()
            .input('uid', sql.Int, uid)
            .query(`
                SELECT COUNT(*) AS UnreadCount
                FROM Notifications n
                WHERE n.IsActive = 1
                  AND NOT EXISTS (
                      SELECT 1 FROM NotificationReads nr
                      WHERE nr.NotificationID = n.NotificationID AND nr.UserID = @uid
                  )
            `);

        // Latest unread notification for popup
        const latestRes = await pool.request()
            .input('uid', sql.Int, uid)
            .query(`
                SELECT TOP 1
                    n.NotificationID, n.Title, n.Message, n.Type, n.CreatedAt
                FROM Notifications n
                WHERE n.IsActive = 1
                  AND NOT EXISTS (
                      SELECT 1 FROM NotificationReads nr
                      WHERE nr.NotificationID = n.NotificationID AND nr.UserID = @uid
                  )
                ORDER BY n.CreatedAt DESC
            `);

        res.json({
            success: true,
            unreadCount: countRes.recordset[0].UnreadCount,
            latest: latestRes.recordset[0] || null
        });
    } catch (err) {
        res.status(500).json({ success: false, unreadCount: 0, latest: null });
    }
});

// POST /api/notifications/:id/read — mark a single notification as read
router.post('/api/notifications/:id/read', checkAuth, checkNotBanned, async (req, res) => {
    const uid  = req.session.user.id;
    const nid  = parseInt(req.params.id);
    try {
        const pool = await poolPromise;
        // INSERT only if not already recorded (ignore duplicate)
        await pool.request()
            .input('uid', sql.Int, uid)
            .input('nid', sql.Int, nid)
            .query(`
                IF NOT EXISTS (
                    SELECT 1 FROM NotificationReads
                    WHERE NotificationID = @nid AND UserID = @uid
                )
                INSERT INTO NotificationReads (NotificationID, UserID)
                VALUES (@nid, @uid)
            `);
        res.json({ success: true });
    } catch (err) {
        console.error('Mark read error:', err);
        res.status(500).json({ success: false });
    }
});

// POST /api/notifications/read-all — mark every unread as read
router.post('/api/notifications/read-all', checkAuth, checkNotBanned, async (req, res) => {
    const uid = req.session.user.id;
    try {
        const pool = await poolPromise;
        await pool.request()
            .input('uid', sql.Int, uid)
            .query(`
                INSERT INTO NotificationReads (NotificationID, UserID)
                SELECT n.NotificationID, @uid
                FROM Notifications n
                WHERE n.IsActive = 1
                  AND NOT EXISTS (
                      SELECT 1 FROM NotificationReads nr
                      WHERE nr.NotificationID = n.NotificationID AND nr.UserID = @uid
                  )
            `);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// GET /api/recent-solves — get latest solves for authenticated users
router.get('/api/recent-solves', checkAuth, checkNotBanned, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query(`
                SELECT TOP 8
                    s.SolveID,
                    u.Username,
                    c.Title AS ChallengeTitle,
                    c.Points,
                    s.SolvedAt
                FROM Solves s
                INNER JOIN Users u ON u.UserID = s.UserID
                INNER JOIN Challenges c ON c.ChallengeID = s.ChallengeID
                WHERE ISNULL(u.IsHidden, 0) = 0
                  AND ISNULL(u.IsBanned, 0) = 0
                ORDER BY s.SolvedAt DESC
            `);
        res.json({ success: true, solves: result.recordset });
    } catch (err) {
        console.error('Recent solves error:', err);
        res.status(500).json({ success: false, message: 'Failed to load recent activity.' });
    }
});

// ── Admin API ───────────────────────────────────────────────────────────────

// GET /api/admin/notifications — all notifications with read stats
router.get('/api/admin/notifications', checkAdmin, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT
                n.NotificationID, n.Title, n.Message, n.Type,
                n.IsActive, n.CreatedAt,
                u.Username AS SentBy,
                (SELECT COUNT(*) FROM NotificationReads nr WHERE nr.NotificationID = n.NotificationID) AS ReadCount,
                (SELECT COUNT(*) FROM Users WHERE ISNULL(IsBanned,0)=0 AND ISNULL(IsHidden,0)=0) AS TotalUsers
            FROM Notifications n
            INNER JOIN Users u ON u.UserID = n.CreatedBy
            ORDER BY n.CreatedAt DESC
        `);
        res.json({ success: true, notifications: result.recordset });
    } catch (err) {
        console.error('Admin notif error:', err);
        res.status(500).json({ success: false, message: 'Failed to load notifications.' });
    }
});

// GET /api/admin/notifications/:id/readers — who has read a specific notification
router.get('/api/admin/notifications/:id/readers', checkAdmin, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('nid', sql.Int, req.params.id)
            .query(`
                SELECT u.Username, nr.ReadAt
                FROM NotificationReads nr
                INNER JOIN Users u ON u.UserID = nr.UserID
                WHERE nr.NotificationID = @nid
                ORDER BY nr.ReadAt ASC
            `);
        res.json({ success: true, readers: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to load readers.' });
    }
});

// POST /api/admin/notifications — create notification
router.post('/api/admin/notifications', checkAdmin, async (req, res) => {
    const { title, message, type } = req.body;
    if (!title || !message)
        return res.status(400).json({ success: false, message: 'Title and message are required.' });

    try {
        const pool = await poolPromise;
        await pool.request()
            .input('title',     sql.NVarChar, title)
            .input('message',   sql.NVarChar, message)
            .input('type',      sql.NVarChar, type || 'info')
            .input('createdBy', sql.Int,      req.session.user.id)
            .query(`
                INSERT INTO Notifications (Title, Message, Type, CreatedBy)
                VALUES (@title, @message, @type, @createdBy)
            `);
        res.json({ success: true, message: 'Notification sent to all users.' });
    } catch (err) {
        console.error('Create notif error:', err);
        res.status(500).json({ success: false, message: 'Failed to send notification.' });
    }
});

// PATCH /api/admin/notifications/:id/toggle — toggle active/archived
router.patch('/api/admin/notifications/:id/toggle', checkAdmin, async (req, res) => {
    try {
        const pool = await poolPromise;
        const cur = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT IsActive FROM Notifications WHERE NotificationID = @id');
        if (!cur.recordset.length)
            return res.status(404).json({ success: false, message: 'Not found.' });
        const newVal = cur.recordset[0].IsActive ? 0 : 1;
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('v',  sql.Bit, newVal)
            .query('UPDATE Notifications SET IsActive = @v WHERE NotificationID = @id');
        res.json({ success: true, isActive: newVal });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// DELETE /api/admin/notifications/:id
router.delete('/api/admin/notifications/:id', checkAdmin, async (req, res) => {
    try {
        const pool = await poolPromise;
        // CASCADE on NotificationReads handles cleanup
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM Notifications WHERE NotificationID = @id');
        res.json({ success: true, message: 'Notification deleted.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to delete.' });
    }
});

module.exports = router;