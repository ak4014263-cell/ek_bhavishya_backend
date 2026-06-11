import { getIO } from './socketManager.js';

const pendingOffers = new Map();
const pendingCandidates = new Map();

export const initializeCallHandlers = (socket) => {
    socket.on('join_call_room', async (data) => {
        const callId = data?.callId?.toString();
        if (!callId) {
            console.warn(`[call] join_call_room received with no callId from socket ${socket.id}`);
            return;
        }

        const room = `call_${callId}`;
        await socket.join(room);
        const roomSockets = await getIO().in(room).fetchSockets();
        console.log(`[call] Socket ${socket.id} (user:${socket.userId}) joined ${room}. Room now has ${roomSockets.length} socket(s).`);

        const buffered = pendingOffers.get(callId);
        if (buffered) {
            socket.emit('call_offer', buffered);
            console.log(`[call] Replayed buffered offer to ${socket.id} for call ${callId}`);
            
            const candidates = pendingCandidates.get(callId) || [];
            candidates.forEach(c => socket.emit('ice_candidate', c));
            if (candidates.length > 0) {
                console.log(`[call] Replayed ${candidates.length} buffered ICE candidates to ${socket.id}`);
            }
        } else {
            console.log(`[call] No buffered offer for call ${callId} — waiting for user to send offer.`);
        }

        socket.to(room).emit('call_peer_joined', {
            callId,
            userId: socket.userId?.toString(),
        });
    });

    socket.on('call_offer', (data) => {
        const callId = data?.callId?.toString();
        if (!callId || !data?.sdp) {
            console.warn(`[call] call_offer missing callId or sdp from socket ${socket.id}`);
            return;
        }

        pendingOffers.set(callId, data);
        if (!pendingCandidates.has(callId)) {
            pendingCandidates.set(callId, []);
        }
        const forwarded = socket.to(`call_${callId}`).emit('call_offer', data);
        console.log(`[call] Offer from ${socket.id} buffered and relayed for call ${callId} (type=${data.type})`);
    });

    socket.on('call_answer', (data) => {
        const callId = data?.callId?.toString();
        if (!callId || !data?.sdp) {
            console.warn(`[call] call_answer missing callId or sdp from socket ${socket.id}`);
            return;
        }
        pendingOffers.delete(callId);
        pendingCandidates.delete(callId);
        socket.to(`call_${callId}`).emit('call_answer', data);
        console.log(`[call] Answer from ${socket.id} relayed for call ${callId} (type=${data.type})`);
    });

    socket.on('ice_candidate', (data) => {
        const callId = data?.callId?.toString();
        if (!callId) return;
        
        if (pendingCandidates.has(callId)) {
            pendingCandidates.get(callId).push(data);
        }
        
        socket.to(`call_${callId}`).emit('ice_candidate', data);
        console.log(`[call] ICE candidate from ${socket.id} relayed for call ${callId}`);
    });

    socket.on('reject_call', (data) => {
        const callId = data?.callId?.toString();
        if (!callId) return;
        pendingOffers.delete(callId);
        pendingCandidates.delete(callId);
        socket.to(`call_${callId}`).emit('call_rejected', { callId, reason: 'declined' });
        console.log(`[call] Call ${callId} rejected by ${socket.id}`);
    });

    socket.on('end_call', (data) => {
        const callId = data?.callId?.toString();
        if (!callId) return;
        pendingOffers.delete(callId);
        pendingCandidates.delete(callId);
        socket.to(`call_${callId}`).emit('call_ended', { callId });
        console.log(`[call] Call ${callId} ended by ${socket.id}`);
    });
};
