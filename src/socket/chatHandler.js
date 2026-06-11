import { getIO } from './socketManager.js';
import ChatSession from '../models/ChatSession.js';
import User from '../models/User.js';
import { resolveAstrologerForUser } from '../utils/astrologerLink.js';

export const initializeChatHandlers = (socket) => {
    // Join a chat room
    socket.on('join_chat', (data) => {
        const { sessionId } = data;
        if (!sessionId) return;
        socket.join(`chat_${sessionId}`);
        console.log(`Socket ${socket.id} joined chat room: chat_${sessionId}`);
    });

    // Leave a chat room
    socket.on('leave_chat', (data) => {
        const { sessionId } = data;
        if (!sessionId) return;
        socket.leave(`chat_${sessionId}`);
        console.log(`Socket ${socket.id} left chat room: chat_${sessionId}`);
    });

    // Typing indicator
    socket.on('typing', (data) => {
        const { sessionId, isTyping } = data;
        if (!sessionId) return;
        socket.to(`chat_${sessionId}`).emit('user_typing', { 
            sessionId, 
            userId: socket.userId, 
            isTyping 
        });
    });

    // Send a message
    socket.on('send_message', async (data) => {
        const { sessionId, content, tempId, attachments } = data;
        if (!sessionId) return;

        const io = getIO();
        
        try {
            const session = await ChatSession.findById(sessionId);
            if (!session) {
                console.error(`Chat session ${sessionId} not found for message`);
                return;
            }

            // Safety check: ensure user is part of this session
            const isUser = session.userId.toString() === socket.userId.toString();

            const user = await User.findById(socket.userId);
            const astrologerDoc = user ? await resolveAstrologerForUser(user) : null;
            const isAstrologer =
                astrologerDoc &&
                astrologerDoc._id.toString() === session.astrologerId.toString();
            
            if (!isUser && !isAstrologer) {
                console.warn(`Unauthorized message attempt by ${socket.userId} in session ${sessionId}`);
                return;
            }

            const senderType = isUser ? 'user' : 'astrologer';

            const newMessage = {
                senderId: socket.userId,
                senderType,
                content: content || '',
                attachments: attachments || [],
                timestamp: new Date()
            };

            // Save to DB
            const updatedSession = await ChatSession.findByIdAndUpdate(
                sessionId, 
                { $push: { messages: newMessage } },
                { new: true }
            );

            // Get the saved message (last one in the array)
            const savedMessage = updatedSession.messages[updatedSession.messages.length - 1];

            // Broadcast the message to the room
            const sid = sessionId.toString();
            io.to(`chat_${sid}`).emit('new_message', {
                sessionId: sid,
                message: {
                    ...savedMessage.toObject(),
                    tempId // Send back tempId for optimistic UI matching
                }
            });
        } catch (error) {
            console.error('Error handling send_message:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    // End a chat
    socket.on('end_chat', async (data) => {
        const { sessionId } = data;
        if (!sessionId) return;

        try {
            await ChatSession.findByIdAndUpdate(sessionId, {
                status: 'ended',
                endTime: new Date(),
            });
            const io = getIO();
            io.to(`chat_${sessionId}`).emit('chat_ended', { sessionId });
        } catch (error) {
            console.error('Error ending chat:', error);
        }
    });
};
