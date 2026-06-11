import { getIO } from './socketManager.js';
import LiveSession from '../models/LiveSession.js';

export const initializeLiveHandlers = (socket) => {
    // Join live stream
    socket.on('join_live', async (data) => {
        const { sessionId } = data;
        socket.join(`live_${sessionId}`);
        socket.activeLiveRoom = sessionId; // track viewer room for disconnect cleanup
        console.log(`[Live] Socket ${socket.id} (User: ${socket.userId}) joined room: live_${sessionId}`);
        
        const io = getIO();
        const currentViewers = io.sockets.adapter.rooms.get(`live_${sessionId}`)?.size || 1;

        try {
            await LiveSession.findByIdAndUpdate(sessionId, {
                $set: { currentViewersCount: currentViewers }
            });
        } catch (e) {
            console.error('[Live] Error updating viewer count on join:', e);
        }

        // Notify all clients in the room of the updated viewer count
        io.to(`live_${sessionId}`).emit('viewer_joined', {
            viewerId: socket.id,
            currentViewers: currentViewers
        });
    });

    // Leave live stream
    socket.on('leave_live', async (data) => {
        const { sessionId } = data;
        socket.leave(`live_${sessionId}`);
        socket.activeLiveRoom = null;
        console.log(`[Live] Socket ${socket.id} (User: ${socket.userId}) left room: live_${sessionId}`);

        const io = getIO();
        const currentViewers = io.sockets.adapter.rooms.get(`live_${sessionId}`)?.size || 0;

        try {
            await LiveSession.findByIdAndUpdate(sessionId, {
                $set: { currentViewersCount: currentViewers }
            });
        } catch (e) {
            console.error('[Live] Error updating viewer count on leave:', e);
        }

        io.to(`live_${sessionId}`).emit('viewer_left', {
            viewerId: socket.id,
            currentViewers: currentViewers
        });
    });

    // Start live stream
    socket.on('start_live', async (data) => {
        const { sessionId } = data;
        socket.isBroadcaster = true;
        socket.activeSessionId = sessionId;
        socket.join(`live_${sessionId}`);
        console.log(`[Live] Broadcaster ${socket.id} started live session: ${sessionId}`);
        socket.to(`live_${sessionId}`).emit('live_started', { sessionId });
    });

    // End live stream
    socket.on('end_live', async (data) => {
        const { sessionId } = data;
        try {
            await LiveSession.findByIdAndUpdate(sessionId, {
                status: 'ended',
                endTime: new Date()
            });
            console.log(`[Live] Session ${sessionId} explicitly ended by broadcaster.`);
        } catch (err) {
            console.error('[Live] Error ending session on end_live:', err);
        }
        const io = getIO();
        io.to(`live_${sessionId}`).emit('live_ended', { sessionId });
        
        // Disconnect everyone in the room (optional cleanup)
        io.in(`live_${sessionId}`).socketsLeave(`live_${sessionId}`);
    });

    // Handle live chat messages
    socket.on('live_message', (data) => {
        const { sessionId } = data;
        const io = getIO();
        io.to(`live_${sessionId}`).emit('live_chat_message', {
            ...data,
            senderId: socket.userId || socket.id,
            timestamp: new Date()
        });
    });

    // Handle stream likes
    socket.on('live_like', async (data) => {
        const { sessionId } = data;
        try {
            const updatedSession = await LiveSession.findByIdAndUpdate(
                sessionId,
                { $inc: { likes: 1 } },
                { new: true }
            );
            if (updatedSession) {
                const io = getIO();
                io.to(`live_${sessionId}`).emit('like_update', {
                    sessionId,
                    likes: updatedSession.likes
                });
                console.log(`[Live] Stream ${sessionId} liked! New likes: ${updatedSession.likes}`);
            }
        } catch (e) {
            console.error('[Live] Error handling live_like:', e);
        }
    });

    // Live WebRTC Signaling (Broadcaster -> Viewer or Viewer -> Broadcaster)
    socket.on('live_offer', (data) => {
        const { sessionId, sdp, type, to } = data;
        console.log(`[Live] Offer from ${socket.id} to ${to || 'room'}`);
        if (to) {
            socket.to(to).emit('live_offer', { ...data, from: socket.id });
        } else {
            socket.to(`live_${sessionId}`).emit('live_offer', { ...data, from: socket.id });
        }
    });

    socket.on('live_answer', (data) => {
        const { sessionId, sdp, type, to } = data;
        console.log(`[Live] Answer from ${socket.id} to ${to || 'room'}`);
        if (to) {
            socket.to(to).emit('live_answer', { ...data, from: socket.id });
        } else {
            socket.to(`live_${sessionId}`).emit('live_answer', { ...data, from: socket.id });
        }
    });

    socket.on('live_ice_candidate', (data) => {
        const { sessionId, candidate, sdpMid, sdpMLineIndex, to } = data;
        console.log(`[Live] ICE Candidate from ${socket.id} to ${to || 'room'}`);
        if (to) {
            socket.to(to).emit('live_ice_candidate', { ...data, from: socket.id });
        } else {
            socket.to(`live_${sessionId}`).emit('live_ice_candidate', { ...data, from: socket.id });
        }
    });

    // Viewer leaves or Broadcaster disconnects
    socket.on('disconnect', async () => {
        if (socket.isBroadcaster && socket.activeSessionId) {
            console.log(`[Live] Broadcaster ${socket.id} disconnected. Ending session: ${socket.activeSessionId}`);
            try {
                await LiveSession.findByIdAndUpdate(socket.activeSessionId, {
                    status: 'ended',
                    endTime: new Date()
                });
                
                const io = getIO();
                io.to(`live_${socket.activeSessionId}`).emit('live_ended', { sessionId: socket.activeSessionId });
                io.in(`live_${socket.activeSessionId}`).socketsLeave(`live_${socket.activeSessionId}`);
            } catch (err) {
                console.error('[Live] Error ending session on disconnect:', err);
            }
        } else if (socket.activeLiveRoom) {
            const sessionId = socket.activeLiveRoom;
            console.log(`[Live] Viewer ${socket.id} disconnected from room: live_${sessionId}`);
            
            const io = getIO();
            const currentViewers = io.sockets.adapter.rooms.get(`live_${sessionId}`)?.size || 0;

            try {
                await LiveSession.findByIdAndUpdate(sessionId, {
                    $set: { currentViewersCount: currentViewers }
                });
            } catch (e) {
                console.error('[Live] Error updating viewer count on disconnect:', e);
            }

            io.to(`live_${sessionId}`).emit('viewer_left', {
                viewerId: socket.id,
                currentViewers: currentViewers
            });
        }
    });
};
