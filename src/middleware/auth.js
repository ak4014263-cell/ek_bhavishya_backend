import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer')) {
        return res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        req.user = await User.findById(decoded.id).select('-password');
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }
        return next();
    } catch (error) {
        console.error(error);
        return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
    }
};

/** Sets req.user when Bearer token is valid; continues without user if missing/invalid */
export const optionalProtect = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer')) {
        return next();
    }
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        req.user = await User.findById(decoded.id).select('-password');
    } catch (_) {
        req.user = undefined;
    }
    return next();
};

/** Bearer header or ?token= for opening protected files in browser / video player */
export const protectBearerOrQueryToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer')) {
        return protect(req, res, next);
    }
    const qToken = req.query.token;
    if (qToken) {
        try {
            const decoded = jwt.verify(qToken, process.env.JWT_SECRET);
            req.user = await User.findById(decoded.id).select('-password');
            if (req.user) return next();
        } catch (_) {
            /* fall through */
        }
    }
    return res.status(401).json({ success: false, message: 'Not authorized' });
};

export const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: `User role ${req.user.role} is not authorized to access this route` 
            });
        }
        next();
    };
};
