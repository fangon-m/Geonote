const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

async function authenticateToken(req) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return null;
    const token = authHeader.split(' ')[1];
    if (!token) return null;
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

module.exports = async (req, res) => {
    if (req.method === 'GET') {
        // Return all notes
        try {
            const result = await pool.query('SELECT id, user_id, content, x_coordinate, y_coordinate, created_at FROM notes ORDER BY id ASC');
            return res.status(200).json(result.rows);
        } catch (error) {
            return res.status(500).json({ error: 'Server error', details: error.message });
        }
    }

    if (req.method === 'POST') {
        const user = await authenticateToken(req);
        if (!user) {
            return res.status(401).json({ error: 'Access token required' });
        }

        const { content, x, y } = req.body;
        if (!content || x === undefined || y === undefined) {
            return res.status(400).json({ error: 'Content and coordinates are required' });
        }
        if (content.length > 200) {
            return res.status(400).json({ error: 'Note content too long (max 200 characters)' });
        }

        // Check daily limit
        const today = new Date().toISOString().split('T')[0];
        const usageResult = await pool.query(
            `SELECT COUNT(*) FROM notes WHERE user_id = $1 AND created_at::date = $2`,
            [user.id, today]
        );
        const count = parseInt(usageResult.rows[0].count, 10);
        if (count >= 10) {
            return res.status(429).json({ error: 'Daily limit of 10 notes reached' });
        }

        try {
            const result = await pool.query(
                `INSERT INTO notes (user_id, content, x_coordinate, y_coordinate) VALUES ($1, $2, $3, $4) RETURNING *`,
                [user.id, content, x, y]
            );
            return res.status(201).json(result.rows[0]);
        } catch (error) {
            return res.status(500).json({ error: 'Server error', details: error.message });
        }
    }

    res.status(405).json({ error: 'Method not allowed' });
};