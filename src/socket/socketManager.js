import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { initializeCallHandlers } from './callHandler.js';
import { initializeChatHandlers } from './chatHandler.js';
import { initializeLiveHandlers } from './liveHandler.js';
import Astrologer from '../models/Astrologer.js';
import User from '../models/User.js';
import Seller from '../models/Seller.js';
import { resolveAstrologerForUser } from '../utils/astrologerLink.js';

let io;

const readHandshakeToken = (socket) => {
    const auth = socket.handshake.auth?.token;
    if (auth) return auth;

    const q = socket.handshake.query?.token;
    if (Array.isArray(q)) return q[0];
    if (typeof q === 'string' && q.length > 0) return q;

    const header = socket.handshake.headers?.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
        return header.slice(7);
    }
    return null;
};

export const initializeSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        },
        pingTimeout: 60000,
        pingInterval: 25000,
        connectTimeout: 45000,
    });

    io.use((socket, next) => {
        const token = readHandshakeToken(socket);
        if (!token) {
            return next(new Error('Authentication error'));
        }
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
            socket.userId = decoded.id || decoded._id;
            next();
        } catch (err) {
            next(new Error('Authentication error: Invalid token'));
        }
    });

    io.on('connection', async (socket) => {
        console.log(`User connected: ${socket.id} (User: ${socket.userId})`);
        
        // Join a private room for this user
        socket.join(`user_${socket.userId}`);

        // Update User presence for everyone (including users and astrologers)
        try {
            const user = await User.findById(socket.userId);
            await User.findByIdAndUpdate(socket.userId, { $set: { isOnline: true } });

            const astrologer = user ? await resolveAstrologerForUser(user) : null;
            if (astrologer) {
                await Astrologer.findByIdAndUpdate(astrologer._id, {
                    $set: {
                        'systemStatus.isOnline': true,
                        'availability.status': 'online',
                        'availability.lastOnlineAt': new Date(),
                    },
                });
                socket.join(`astrologer_${astrologer._id}`);
                console.log(`[socket] ${socket.id} joined astrologer_${astrologer._id} (user_${socket.userId})`);
                io.emit('user_presence', { userId: socket.userId, isOnline: true });
            }

            const seller = await Seller.findOne({ userId: socket.userId });
            if (seller) {
                socket.join(`seller_${seller._id}`);
            }
        } catch (err) {
            console.error('Presence error:', err);
        }

        // Initialize Call Handlers
        initializeCallHandlers(socket);

        // Initialize Chat Handlers
        initializeChatHandlers(socket);

        // Initialize Live Handlers
        initializeLiveHandlers(socket);

        socket.on('disconnect', async () => {
            console.log(`User disconnected: ${socket.id}`);
            
            try {
                // Check if this was the last socket for this user
                const sockets = await io.in(`user_${socket.userId}`).fetchSockets();
                if (sockets.length === 0) {
                    await User.findByIdAndUpdate(socket.userId, { $set: { isOnline: false } });

                    const astrologer = await Astrologer.findOneAndUpdate(
                        { userId: socket.userId },
                        { $set: { 'systemStatus.isOnline': false } },
                        { new: true, returnDocument: 'after' }
                    );

                    if (astrologer) {
                        io.emit('user_presence', { userId: socket.userId, isOnline: false });
                    }
                }
            } catch (err) {
                console.error('Presence disconnect error:', err);
            }
        });
    });

    return io;
};

export const getIO = () => {
    return io;
};
