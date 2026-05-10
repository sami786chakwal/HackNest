const express = require('express');
const router = express.Router();
const { sql, poolPromise } = require('../db');

// ── Middleware ──────────────────────────────────────────────────────────────

const checkAuth = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/login');
};

const checkNotBanned = async (req, res, next) => {
    if (!req.session.user) return next();
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.session.user.id)
            .query('SELECT IsBanned FROM Users WHERE UserID = @id');
        if (result.recordset[0]?.IsBanned)
            return res.sendFile(require('path').join(__dirname, '../views/banned.html'));
        next();
    } catch { next(); }
};

const checkAdmin = (req, res, next) => {
    if (req.session.user?.role?.toLowerCase() === 'admin') return next();
    res.status(403).json({ success: false, message: 'Admin access required.' });
};

// ── View Routes ─────────────────────────────────────────────────────────────

router.get('/challenges', checkAuth, checkNotBanned, (req, res) => {
    res.sendFile(require('path').join(__dirname, '../views/challenges.html'));
});

router.get('/admin/challenges', checkAdmin, checkNotBanned, (req, res) => {
    res.sendFile(require('path').join(__dirname, '../views/admin-challenges.html'));
});

// ── Public API ──────────────────────────────────────────────────────────────

// GET /api/challenges — list all active challenges (flag hidden)
router.get('/api/challenges', checkAuth, checkNotBanned, async (req, res) => {
    try {
        const pool = await poolPromise;
        const userId = req.session.user.id;

        const result = await pool.request()
            .input('uid', sql.Int, userId)
            .query(`
                SELECT
                    c.ChallengeID, c.Title, c.Description, c.Category,
                    c.Difficulty, c.Points, c.Hint, c.IsActive, c.CreatedAt,
                    (SELECT COUNT(*) FROM Solves WHERE ChallengeID = c.ChallengeID) AS SolveCount,
                    CASE WHEN s.SolveID IS NOT NULL THEN 1 ELSE 0 END AS IsSolved
                FROM Challenges c
                LEFT JOIN Solves s ON s.ChallengeID = c.ChallengeID AND s.UserID = @uid
                WHERE c.IsActive = 1
                ORDER BY c.Category, c.Points
            `);

        res.json({ success: true, challenges: result.recordset });
    } catch (err) {
        console.error('Challenges API error:', err);
        res.status(500).json({ success: false, message: 'Failed to load challenges.' });
    }
});

// POST /api/challenges/:id/submit — submit a flag
router.post('/api/challenges/:id/submit', checkAuth, checkNotBanned, async (req, res) => {
    const challengeId = parseInt(req.params.id);
    const { flag } = req.body;
    const userId = req.session.user.id;

    if (!flag) return res.status(400).json({ success: false, message: 'No flag submitted.' });

    try {
        const pool = await poolPromise;

        // Get the challenge
        const chResult = await pool.request()
            .input('id', sql.Int, challengeId)
            .query('SELECT ChallengeID, Flag, Points, IsActive FROM Challenges WHERE ChallengeID = @id');

        if (chResult.recordset.length === 0)
            return res.status(404).json({ success: false, message: 'Challenge not found.' });

        const challenge = chResult.recordset[0];

        if (!challenge.IsActive)
            return res.status(403).json({ success: false, message: 'Challenge is not active.' });

        // Check already solved
        const solvedCheck = await pool.request()
            .input('uid', sql.Int, userId)
            .input('cid', sql.Int, challengeId)
            .query('SELECT SolveID FROM Solves WHERE UserID = @uid AND ChallengeID = @cid');

        if (solvedCheck.recordset.length > 0)
            return res.json({ success: false, message: 'You already solved this challenge!' });

        // Compare flag (trim whitespace, case-sensitive)
        if (flag.trim() !== challenge.Flag.trim())
            return res.json({ success: false, message: 'Incorrect flag. Try again!' });

        // Record solve + add points atomically
        await pool.request()
            .input('uid', sql.Int, userId)
            .input('cid', sql.Int, challengeId)
            .input('pts', sql.Int, challenge.Points)
            .query(`
                INSERT INTO Solves (UserID, ChallengeID) VALUES (@uid, @cid);
                UPDATE Users SET Score = Score + @pts WHERE UserID = @uid;
            `);

        res.json({ success: true, message: `Correct! +${challenge.Points} points added to your score.` });
    } catch (err) {
        console.error('Flag submit error:', err);
        res.status(500).json({ success: false, message: 'Submission error.' });
    }
});

// ── Admin API ───────────────────────────────────────────────────────────────

// GET /api/admin/challenges
router.get('/api/admin/challenges', checkAdmin, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT c.*,
                (SELECT COUNT(*) FROM Solves WHERE ChallengeID = c.ChallengeID) AS SolveCount
            FROM Challenges c
            ORDER BY c.CreatedAt DESC
        `);
        res.json({ success: true, challenges: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to load challenges.' });
    }
});

// POST /api/admin/challenges — create
router.post('/api/admin/challenges', checkAdmin, async (req, res) => {
    const { title, description, category, difficulty, points, flag, hint, isActive } = req.body;
    if (!title || !description || !category || !difficulty || !points || !flag)
        return res.status(400).json({ success: false, message: 'Missing required fields.' });

    try {
        const pool = await poolPromise;
        await pool.request()
            .input('title',       sql.NVarChar, title)
            .input('description', sql.NVarChar, description)
            .input('category',    sql.NVarChar, category)
            .input('difficulty',  sql.NVarChar, difficulty)
            .input('points',      sql.Int,      parseInt(points))
            .input('flag',        sql.NVarChar, flag)
            .input('hint',        sql.NVarChar, hint || null)
            .input('isActive',    sql.Bit,      isActive ? 1 : 0)
            .input('createdBy',   sql.Int,      req.session.user.id)
            .query(`
                INSERT INTO Challenges (Title, Description, Category, Difficulty, Points, Flag, Hint, IsActive, CreatedBy)
                VALUES (@title, @description, @category, @difficulty, @points, @flag, @hint, @isActive, @createdBy)
            `);
        res.json({ success: true, message: 'Challenge created successfully.' });
    } catch (err) {
        console.error('Create challenge error:', err);
        res.status(500).json({ success: false, message: 'Failed to create challenge.' });
    }
});

// PUT /api/admin/challenges — update
router.put('/api/admin/challenges', checkAdmin, async (req, res) => {
    const { challengeId, title, description, category, difficulty, points, flag, hint, isActive } = req.body;
    if (!challengeId || !title || !description || !category || !difficulty || !points || !flag)
        return res.status(400).json({ success: false, message: 'Missing required fields.' });

    try {
        const pool = await poolPromise;
        await pool.request()
            .input('id',          sql.Int,      parseInt(challengeId))
            .input('title',       sql.NVarChar, title)
            .input('description', sql.NVarChar, description)
            .input('category',    sql.NVarChar, category)
            .input('difficulty',  sql.NVarChar, difficulty)
            .input('points',      sql.Int,      parseInt(points))
            .input('flag',        sql.NVarChar, flag)
            .input('hint',        sql.NVarChar, hint || null)
            .input('isActive',    sql.Bit,      isActive ? 1 : 0)
            .query(`
                UPDATE Challenges
                SET Title=@title, Description=@description, Category=@category,
                    Difficulty=@difficulty, Points=@points, Flag=@flag,
                    Hint=@hint, IsActive=@isActive
                WHERE ChallengeID=@id
            `);
        res.json({ success: true, message: 'Challenge updated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update challenge.' });
    }
});

// PATCH /api/admin/challenges/:id/toggle — toggle active state
router.patch('/api/admin/challenges/:id/toggle', checkAdmin, async (req, res) => {
    try {
        const pool = await poolPromise;
        const current = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT IsActive FROM Challenges WHERE ChallengeID = @id');
        if (!current.recordset.length)
            return res.status(404).json({ success: false, message: 'Challenge not found.' });

        const newStatus = current.recordset[0].IsActive ? 0 : 1;
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('s',  sql.Bit, newStatus)
            .query('UPDATE Challenges SET IsActive = @s WHERE ChallengeID = @id');
        res.json({ success: true, isActive: newStatus });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to toggle status.' });
    }
});

// DELETE /api/admin/challenges/:id
router.delete('/api/admin/challenges/:id', checkAdmin, async (req, res) => {
    try {
        const pool = await poolPromise;
        // Remove solves first (FK constraint), then challenge
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM Solves WHERE ChallengeID = @id; DELETE FROM Challenges WHERE ChallengeID = @id;');
        res.json({ success: true, message: 'Challenge deleted.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to delete challenge.' });
    }
});

module.exports = router;