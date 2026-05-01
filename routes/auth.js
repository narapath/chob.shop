const express = require('express');
const router = express.Router();
require('dotenv').config();

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'vibe_secret_token_12345';

// Authentication Middleware
const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader === `Bearer ${AUTH_TOKEN}`) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// Login Route
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        res.json({ success: true, token: AUTH_TOKEN });
    } else {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
});

module.exports = {
    router,
    requireAuth
};
