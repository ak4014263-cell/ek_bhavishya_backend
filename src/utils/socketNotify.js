import { getIO } from '../socket/socketManager.js';

/**
 * Emit to an astrologer on all relevant socket rooms (linked user + astrologer doc).
 */
export const emitToAstrologer = (astrologer, event, payload) => {
    const io = getIO();
    if (!io || !astrologer) return;

    const rooms = new Set();
    if (astrologer.userId) {
        rooms.add(`user_${astrologer.userId}`);
    }
    if (astrologer._id) {
        rooms.add(`astrologer_${astrologer._id}`);
    }

    if (rooms.size === 0) {
        console.warn(`[socket] No rooms for astrologer ${astrologer._id} — link userId on astrologer profile`);
        return;
    }
    for (const room of rooms) {
        io.to(room).emit(event, payload);
    }
};

export const emitToUser = (userId, event, payload) => {
    const io = getIO();
    if (!io || !userId) return;
    io.to(`user_${userId}`).emit(event, payload);
};
