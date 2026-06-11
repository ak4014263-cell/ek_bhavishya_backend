import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './src/config/db.js';
import axios from 'axios';
import crypto from 'node:crypto';
if (!globalThis.crypto) {
    globalThis.crypto = crypto;
}
import { initializeSocket } from './src/socket/socketManager.js';
import './src/config/firebase.js';
import authRoutes from './src/routes/authRoutes.js';
import userRoutes from './src/routes/userRoutes.js';
import astrologerRoutes from './src/routes/astrologerRoutes.js';
import liveRoutes from './src/routes/liveRoutes.js';
import blogRoutes from './src/routes/blogRoutes.js';
import adminRoute from './src/modules/admin/routes/admin.routes.js';
import sellerRoute from './src/modules/seller/routes/seller.routes.js';
import { getSellerOrders } from './src/modules/seller/controllers/seller.controller.js';
import { protect, authorize } from './src/middleware/auth.js';
import configRoutes from './src/routes/configRoutes.js';
import paymentRoutes from './src/routes/paymentRoutes.js';
import trackingRoutes from './src/routes/trackingRoutes.js';
// FCM removed
import { checkMaintenanceMode } from './src/middleware/maintenance.js';

import './src/models/Seller.js'; // Ensure Seller is registered

dotenv.config();

const app = express();
const server = http.createServer(app);

// Connect to Database
connectDB();

// FCM initialization removed


// Middlewares
app.use(cors());

// Custom Request Logger
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const statusColor = res.statusCode >= 500 ? '\x1b[31m' // Red
            : res.statusCode >= 400 ? '\x1b[33m' // Yellow
            : res.statusCode >= 300 ? '\x1b[36m' // Cyan
            : '\x1b[32m'; // Green
        
        console.log(`[API] ${req.method} ${req.originalUrl} ${statusColor}${res.statusCode}\x1b[0m - ${duration}ms`);
    });
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(checkMaintenanceMode);
app.use('/uploads', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (req.query.download === 'true') {
        res.setHeader('Content-Disposition', 'attachment');
    }
    next();
});
app.use('/astrologers', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
});
app.use('/uploads', express.static('uploads'));
app.use('/astrologers', express.static('uploads/astrologers')); 
app.use('/products', express.static('uploads/product_images'));
app.use('/remedies', express.static('uploads/remedy_images'));

// Fallback for static files: if not found on the current server, automatically proxy the request to the legacy IP (52.23.25.215)
const staticFallback = async (req, res, next) => {
    if (req.method !== 'GET') return next();
    
    const targetUrl = `http://52.23.25.215:5001${req.originalUrl}`;
    
    try {
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            timeout: 5000 // 5 seconds timeout
        });
        
        // Pass content-type from legacy response
        if (response.headers['content-type']) {
            res.setHeader('content-type', response.headers['content-type']);
        }
        
        // Pipe the legacy server response stream directly to the client
        response.data.pipe(res);
    } catch (error) {
        // Silent catch for normal 404s to avoid log pollution, fall back to standard Express error
        next();
    }
};
app.use('/uploads', staticFallback);
app.use('/astrologers', staticFallback);
app.use('/products', staticFallback);
app.use('/remedies', staticFallback);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/astrologer', astrologerRoutes);
import agoraRoutes from './src/routes/agoraRoutes.js';
app.use('/api/agora', agoraRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/v1/admin', adminRoute);
app.use('/api/v1/seller', sellerRoute);
app.use('/api/seller', sellerRoute); // alias for clients using /api/seller (without v1)
// Legacy seller app paths (older Flutter builds)
app.get('/api/v1/user/orders/seller/orders', protect, authorize('seller'), getSellerOrders);
app.use('/api/config', configRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/tracking', trackingRoutes);

// Root Route
app.get('/', (req, res) => {
    res.status(200).json({ 
        message: 'Welcome to Ek Bhavishya API', 
        status: 'Online',
        version: '1.0.0' 
    });
});

// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Backend is running' });
});

// Initialize Socket.io
const io = initializeSocket(server);

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

export default app;

