const express = require('express');
const session = require('express-session');
const path = require('path');
const helmet = require('helmet'); // Security headers
const morgan = require('morgan'); // Request logging
require('dotenv').config(); // Load environment variables

const app = express();

// --- 1. Security & Optimization ---
// Helmet helps secure your app by setting various HTTP headers
app.use(helmet({
    contentSecurityPolicy: false, // Set to false if using many external CDNs, or configure properly
}));

// Standard request logging for debugging and monitoring
app.use(morgan('dev'));

// Performance: compress responses if you add the 'compression' package
// const compression = require('compression');
// app.use(compression());

// --- 2. Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- 3. Session Management ---
// In a real prod app, use 'connect-mongo' or 'connect-redis' to store sessions
const isProduction = process.env.NODE_ENV === 'production';
const isSecureSession = process.env.SESSION_SECURE === 'true';
if (isProduction) {
    app.set('trust proxy', 1);
}
app.use(session({
    name: 'hacknest.sid', // Custom cookie name is more professional
    secret: process.env.SESSION_SECRET || 'dev_secret_key_8891',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true, // Prevents XSS from reading the cookie
        secure: isProduction && isSecureSession, // Require explicit SESSION_SECURE in production
        sameSite: 'lax',
        maxAge: 60 * 60 * 1000 // 1 hour
    }
}));

// --- 4. Routes ---
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const challengeRoutes = require('./routes/challenges');
const notificationRoutes = require('./routes/notifications');
app.use('/', notificationRoutes);
app.use('/', challengeRoutes);
app.use('/', authRoutes);
app.use('/', adminRoutes);

// Global 404 Handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'views/404.html'));
});

// --- 5. Error Handling ---
// Professional catch-all for server errors
app.use((err, req, res, next) => {
    console.error(`[Server Error] ${err.stack}`);
    res.status(500).json({ 
        success: false, 
        message: 'Internal System Error. Our engineers have been notified.' 
    });
});

// --- 6. Initialization ---
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`
    ┌──────────────────────────────────────────┐
    │  🚀 HACKNEST CORE IS ONLINE              │
    │  📡 Port: ${PORT}                           │
    │  Mode: ${process.env.NODE_ENV || 'development'}                │
    └──────────────────────────────────────────┘
    `);
});

// Handle graceful shutdowns (important for DB connections)
process.on('SIGTERM', () => {
    server.close(() => {
        console.log('Process terminated gracefully.');
    });
});