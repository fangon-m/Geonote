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
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const user = await authenticateToken(req);
    if (!user) {
        return res.status(401).json({ error: 'Access token required' });
    }

    const today = new Date().toISOString().split('T')[0];
    try {
        const usageResult = await pool.query(
            `SELECT COUNT(*) FROM notes WHERE user_id = $1 AND created_at::date = $2`,
            [user.id, today]
        );
        const count = parseInt(usageResult.rows[0].count, 10);

        res.status(200).json({
            quota: 10,
            used: count,
            remaining: 10 - count
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error', details: error.message });
    }
};