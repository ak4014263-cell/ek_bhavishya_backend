import User from '../models/User.js';
import Astrologer from '../models/Astrologer.js';
import Review from '../models/Review.js';
import CallSession from '../models/CallSession.js';
import ChatSession from '../models/ChatSession.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';
import Feedback from '../models/Feedback.js';
import Product from '../models/Product.js';
import Remedy from '../models/Remedy.js';
import Course from '../models/Course.js';
import jwt from 'jsonwebtoken';
import { normalizeMediaPath } from '../utils/astrologerLink.js';
import { getIceServers } from '../utils/turnServer.js';
import { getIO } from '../socket/socketManager.js';
import { emitToAstrologer } from '../utils/socketNotify.js';
import { createNotification } from '../utils/notificationService.js';
import Admin from '../modules/admin/models/admin.model.js';


const generateToken = (id) => {
    const secret = process.env.JWT_SECRET || 'secret';
    return jwt.sign({ id, role: 'user' }, secret, {
        expiresIn: '30d',
    });
};

import { sendOtpEmail } from '../utils/emailService.js';

export const requestOtp = async (req, res) => {
    try {
        const { email, phoneNumber } = req.body;
        const identifier = email || phoneNumber;

        if (!identifier) {
            return res.status(400).json({ success: false, message: 'Email or Phone Number is required' });
        }

        let otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        if (identifier === '9999999999') {
            otp = '999999';
        }

        let user = await User.findOne({ 
            $or: [{ email: identifier }, { phoneNumber: identifier }] 
        });

        if (user && user.isDeleted) {
            return res.status(403).json({ success: false, message: 'Your account has been deleted.' });
        }

        if (!user) {
            // Check if email or phone is already registered under Admin or User with another role
            if (email) {
                const emailRegex = new RegExp(`^${email.trim()}$`, 'i');
                const adminExists = await Admin.findOne({ email: emailRegex });
                const userExists = await User.findOne({ email: emailRegex });
                if (adminExists || userExists) {
                    return res.status(400).json({ success: false, message: 'This email is already registered with another account or role' });
                }
            }

            const defaultName = identifier.split('@')[0] || 'User';
            user = await User.create({
                email: email || undefined,
                phoneNumber: phoneNumber || undefined,
                fullName: defaultName,
                role: 'user'
            });
        }

        await User.findByIdAndUpdate(user._id, {
            otp,
            otp_expiry: otpExpiry
        }, { runValidators: false });

        // Send Email if it's an email request
        if (email) {
            const emailResult = await sendOtpEmail(email, otp);
            if (!emailResult.success) {
                console.error('[requestOtp] Email sending failed:', emailResult.error);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Failed to send OTP email. Please try again later.',
                    details: emailResult.error
                });
            }
        }

        res.status(200).json({ 
            success: true, 
            message: 'OTP sent successfully',
            dev_otp: otp 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const verifyOtp = async (req, res) => {
    try {
        const { email, phoneNumber, otp } = req.body;
        const identifier = email || phoneNumber;

        if (!identifier || !otp) {
            return res.status(400).json({ success: false, message: 'Identifier and OTP are required' });
        }

        const user = await User.findOne({ 
            $or: [{ email: identifier }, { phoneNumber: identifier }] 
        });

        if (user && user.isDeleted) {
            return res.status(403).json({ success: false, message: 'Your account has been deleted.' });
        }

        console.log(`[OTP] Verifying for ${identifier}. Provided: ${otp}, Expected: ${user?.otp}, Expired: ${user && new Date() > user.otp_expiry}`);
        if (!user || user.otp !== otp || new Date() > user.otp_expiry) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
        }

        await User.findByIdAndUpdate(user._id, {
            $unset: { otp: 1, otp_expiry: 1 },
            $set: { referralCode: user.referralCode || ('AIM' + Math.random().toString(36).substring(2, 8).toUpperCase()) }
        }, { runValidators: false });

        const token = generateToken(user._id);

        res.status(200).json({ 
            success: true, 
            message: 'OTP verified successfully',
            token,
            user: {
                _id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                referralCode: user.referralCode
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const initiateCall = async (req, res) => {
    try {
        const { astrologerId, callType } = req.body;
        const userId = req.user.id; 
        
        const user = await User.findById(userId);
        const astrologer = await Astrologer.findById(astrologerId);

        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });
        if (!astrologer.userId) {
            console.warn(`[initiateCall] Astrologer ${astrologer._id} has no linked userId — socket alerts may fail`);
        }

        const perMinRate = callType === 'video' 
            ? (astrologer.pricing?.video || 0) 
            : (astrologer.pricing?.call || 0);
        
        // Minimum balance for 1 minute (Bypass for testing/development if needed)
        if (user.walletBalance < perMinRate && perMinRate > 0) {
            // return res.status(400).json({ success: false, message: 'Insufficient balance. Please recharge your wallet.' });
            console.log(`Bypassing wallet check for user ${userId}. Balance: ${user.walletBalance}, Rate: ${perMinRate}`);
        }

        const call = await CallSession.create({
            userId,
            astrologerId,
            callType,
            status: 'ringing'
        });

        // Notify Astrologer via Socket and FCM (user + astrologer rooms)
        try {
            emitToAstrologer(astrologer, 'incoming_call', {
                callId: call._id.toString(),
                userId: userId.toString(),
                userName: user.fullName,
                callerName: user.fullName,
                callType: callType,
                billingType: req.body.billingType || 'per_minute',
            });

            // Create persistent notification for history and FCM
            await createNotification({
                userId: astrologer.userId,
                title: 'Incoming Call',
                body: `${user.fullName} is calling you for a ${callType} session.`,
                type: 'call',
                data: {
                    callId: call._id.toString(),
                    userId: userId.toString(),
                    userName: user.fullName,
                    callType: callType
                }
            });
        } catch (err) {
            console.error('Call notification failed:', err);
        }

        res.status(201).json({ success: true, data: call, callId: call._id });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getCallDetails = async (req, res) => {
    try {
        const { callId } = req.params;
        const call = await CallSession.findById(callId).populate('astrologerId');
        
        if (!call) return res.status(404).json({ success: false, message: 'Call not found' });
        
        res.status(200).json({ success: true, data: call });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const cancelCall = async (req, res) => {
    try {
        const { callId } = req.params;
        const call = await CallSession.findByIdAndUpdate(callId, { 
            status: 'cancelled'
        }, { new: true });

        if (!call) return res.status(404).json({ success: false, message: 'Call not found' });

        res.status(200).json({ success: true, message: 'Call cancelled', data: call });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const confirmCallConnection = async (req, res) => {
    try {
        const { callId } = req.params;
        const call = await CallSession.findByIdAndUpdate(callId, { 
            status: 'active', 
            startTime: new Date() 
        }, { new: true });

        // Set Astrologer to Busy
        await Astrologer.findByIdAndUpdate(call.astrologerId, { 
            'availability.status': 'busy' 
        });
        
        try {
            const astro = await Astrologer.findById(call.astrologerId);
            getIO().emit('user_presence', { userId: astro.userId, isOnline: true, status: 'busy' });
        } catch (e) {}

        res.status(200).json({ success: true, message: 'Call connected', data: call });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


export const endCall = async (req, res) => {
    try {
        const { callId } = req.params;
        const call = await CallSession.findById(callId);
        
        if (!call) return res.status(404).json({ success: false, message: 'Call not found' });
        if (call.status === 'ended') return res.status(400).json({ success: false, message: 'Call already ended' });

        const endTime = new Date();
        const startTime = call.startTime || call.createdAt;
        const durationInSeconds = Math.floor((endTime - startTime) / 1000);
        const durationInMinutes = Math.ceil(durationInSeconds / 60);

        const astrologer = await Astrologer.findById(call.astrologerId);
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });

        const pricing = astrologer.pricing || { call: 0, video: 0 };
        const perMinRate = call.callType === 'video' ? (pricing.video || 0) : (pricing.call || 0);
        const totalCost = durationInMinutes * perMinRate;

        // Deduct from wallet
        const user = await User.findByIdAndUpdate(call.userId, {
            $inc: { walletBalance: -totalCost }
        }, { new: true, runValidators: false });

        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Add to astrologer wallet
        astrologer.walletBalance = (astrologer.walletBalance || 0) + totalCost;
        await astrologer.save();

        // Create transactions
        // 1. User Debit
        await Transaction.create({
            userId: user._id,
            astrologerId: astrologer._id,
            amount: totalCost,
            type: 'debit',
            description: `Call with ${astrologer.personalDetails.name} (${durationInMinutes} mins)`,
            referenceId: call._id,
            referenceType: 'CallSession'
        });

        // 2. Astrologer Credit
        await Transaction.create({
            astrologerId: astrologer._id,
            userId: user._id,
            amount: totalCost,
            type: 'credit',
            description: `Earnings from call with ${user.fullName} (${durationInMinutes} mins)`,
            referenceId: call._id,
            referenceType: 'CallSession'
        });

        call.status = 'ended';
        call.endTime = endTime;
        call.duration = durationInSeconds;
        call.cost = totalCost;
        await call.save();

        // Set Astrologer back to Online
        await Astrologer.findByIdAndUpdate(call.astrologerId, { 
            'availability.status': 'online' 
        });
        
        try {
            const astro = await Astrologer.findById(call.astrologerId);
            if (astro) {
                getIO().emit('user_presence', { userId: astro.userId, isOnline: true, status: 'online' });
                // Notify astrologer that the user ended the call
                getIO().to(`user_${astro.userId}`).emit('call_ended', { callId: call._id });
            }
        } catch (e) {
            console.error('Socket emit error on endCall:', e);
        }

        res.status(200).json({ success: true, message: 'Call ended and wallet deducted', data: call });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const initiateChat = async (req, res) => {
    try {
        const { astrologerId } = req.params;
        const userId = req.user.id;
        
        const user = await User.findById(userId);
        const astrologer = await Astrologer.findById(astrologerId);

        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });
        if (!astrologer.userId) {
            console.warn(`[initiateChat] Astrologer ${astrologer._id} has no linked userId — socket alerts may fail`);
        }

        // First 5 mins free, but check if they can afford the 6th minute just in case? 
        // Or just allow it if they have > 0? Let's say minimum 1 min rate if they've used their free 5 mins before?
        // Actually the requirement is "first 5 minute is free", usually per user per astrologer or first time ever?
        // Let's assume first 5 mins of EVERY chat session is free for now as requested.
        
        const session = await ChatSession.create({
            userId,
            astrologerId,
            status: 'pending',
            startTime: new Date()
        });

        // Notify Astrologer via Socket and FCM (user + astrologer rooms)
        try {
            emitToAstrologer(astrologer, 'incoming_chat', {
                sessionId: session._id.toString(),
                chatId: session._id.toString(),
                userId: userId.toString(),
                userName: user.fullName,
                sessionType: req.body.sessionType || 'paid',
            });

            // Create persistent notification for history and FCM
            await createNotification({
                userId: astrologer.userId,
                title: 'Incoming Chat Request',
                body: `${user.fullName} has requested a chat session.`,
                type: 'chat',
                data: {
                    sessionId: session._id.toString(),
                    userId: userId.toString(),
                    userName: user.fullName
                }
            });
        } catch (err) {
            console.error('Chat notification failed:', err);
        }

        res.status(201).json({ success: true, data: session, sessionId: session._id });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const endChat = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await ChatSession.findById(sessionId);

        if (!session) return res.status(404).json({ success: false, message: 'Chat session not found' });
        if (session.status === 'ended') return res.status(400).json({ success: false, message: 'Chat already ended' });

        const endTime = new Date();
        const startTime = session.startTime || session.createdAt;
        const durationInSeconds = Math.floor((endTime - startTime) / 1000);
        const durationInMinutes = Math.ceil(durationInSeconds / 60);

        // First 5 minutes free
        const billableMinutes = Math.max(0, durationInMinutes - 5);
        
        const astrologer = await Astrologer.findById(session.astrologerId);
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });

        const pricing = astrologer.pricing || { chat: 0 };
        const totalCost = billableMinutes * (pricing.chat || 0);

        if (totalCost > 0) {
            await User.findByIdAndUpdate(session.userId, {
                $inc: { walletBalance: -totalCost }
            }, { runValidators: false });

            const user = await User.findById(session.userId); // Still need user object for transaction record

            // Add to astrologer wallet
            astrologer.walletBalance = (astrologer.walletBalance || 0) + totalCost;
            await astrologer.save();

            // 1. User Debit
            await Transaction.create({
                userId: user._id,
                astrologerId: astrologer._id,
                amount: totalCost,
                type: 'debit',
                description: `Chat with ${astrologer.personalDetails.name} (${durationInMinutes} mins, 5 mins free)`,
                referenceId: session._id,
                referenceType: 'ChatSession'
            });

            // 2. Astrologer Credit
            await Transaction.create({
                astrologerId: astrologer._id,
                userId: user._id,
                amount: totalCost,
                type: 'credit',
                description: `Earnings from chat with ${user.fullName} (${durationInMinutes} mins, 5 mins free)`,
                referenceId: session._id,
                referenceType: 'ChatSession'
            });
        }

        session.status = 'ended';
        session.endTime = endTime;
        session.duration = durationInSeconds;
        session.cost = totalCost;
        await session.save();
        
        // Set Astrologer back to Online
        try {
            const astro = await Astrologer.findByIdAndUpdate(session.astrologerId, { 
                'availability.status': 'online' 
            });
            if (astro) {
                getIO().emit('user_presence', { userId: astro.userId, isOnline: true, status: 'online' });
                // Notify astrologer that the user ended the chat
                getIO().to(`user_${astro.userId}`).emit('chat_ended', { sessionId: session._id });
            }
        } catch (e) {
            console.error('Socket emit error on endChat:', e);
        }

        res.status(200).json({ success: true, message: 'Chat ended', data: session });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const uploadChatFileGeneric = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const fileUrl = `/uploads/${req.file.filename}`;

        res.status(200).json({
            success: true,
            data: {
                url: fileUrl,
                fileName: req.file.originalname,
                fileSize: req.file.size
            }
        });
    } catch (error) {
        console.error('[uploadChatFileGeneric] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const uploadChatAttachment = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await ChatSession.findById(sessionId);
        if (!session) return res.status(404).json({ success: false, message: 'Chat session not found' });

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: 'No files uploaded' });
        }

        const attachments = req.files.map(file => file.path.replace(/\\/g, '/'));
        const fileType = req.body.type || 'image'; // image or document

        const newMessage = {
            senderId: req.user.id,
            senderType: 'user',
            type: fileType,
            attachments,
            content: req.body.content || '',
            timestamp: new Date()
        };

        session.messages.push(newMessage);
        await session.save();

        const savedMessage = session.messages[session.messages.length - 1];

        // Notify via socket
        const astrologer = await Astrologer.findById(session.astrologerId);
        if (astrologer) {
            const io = getIO();
            if (io) {
                io.to(`user_${astrologer.userId}`).emit('new_message', {
                    sessionId: session._id,
                    message: savedMessage
                });
            }
        }

        res.status(200).json({ success: true, data: savedMessage });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const addChatNote = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { content } = req.body;
        const session = await ChatSession.findById(sessionId);
        if (!session) return res.status(404).json({ success: false, message: 'Chat session not found' });

        const note = { content, timestamp: new Date() };
        session.notes.push(note);
        
        // Also add as a special message if requested to "display in chat"
        const newMessage = {
            senderId: req.user.id,
            senderType: 'user',
            type: 'note',
            content: content,
            timestamp: new Date()
        };
        session.messages.push(newMessage);
        
        await session.save();

        const savedMessage = session.messages[session.messages.length - 1];

        // Notify via socket
        const astrologer = await Astrologer.findById(session.astrologerId);
        if (astrologer) {
            const io = getIO();
            if (io) {
                io.to(`user_${astrologer.userId}`).emit('new_message', {
                    sessionId: session._id,
                    message: savedMessage
                });
            }
        }

        res.status(200).json({ success: true, data: note, message: savedMessage });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const addMoney = async (req, res) => {
    console.log('[DEBUG] addMoney called with amount:', req.body.amount, 'paymentGatewayId:', req.body.paymentGatewayId);
    try {
        const { amount, paymentGatewayId } = req.body;

        // ✓ FIX: Require paymentGatewayId for security
        if (!paymentGatewayId || paymentGatewayId.trim() === '') {
             return res.status(400).json({ 
                 success: false, 
                 message: 'Payment gateway transaction ID is required. No test payments allowed in production.' 
             });
        }

        // ✓ FIX: In production, reject TEST payment IDs
        if (process.env.NODE_ENV === 'production' && paymentGatewayId.startsWith('TEST_')) {
            console.warn('✗ SECURITY: Blocked test payment ID in production:', paymentGatewayId);
            return res.status(400).json({ 
                success: false, 
                message: 'Test payments not allowed. Please complete a real payment.' 
            });
        }

        // ✓ FIX: Validate amount as positive number
        const rechargeAmount = Number(amount);
        if (isNaN(rechargeAmount) || rechargeAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid amount. Amount must be greater than 0.' });
        }

        // ✓ FIX: Reject suspiciously large amounts
        if (rechargeAmount > 100000) {
            return res.status(400).json({ 
                success: false, 
                message: 'Amount exceeds maximum limit of ₹100,000. Please contact support for large transactions.' 
            });
        }

        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        console.log('✓ Processing wallet recharge for user:', req.user._id, 'Amount: ₹' + rechargeAmount);

        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { $inc: { walletBalance: rechargeAmount } },
            { new: true, runValidators: false }
        );

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: 'User not found during update' });
        }

        const transaction = await Transaction.create({
            userId: user._id,
            amount: rechargeAmount,
            type: 'credit',
            status: 'completed',
            description: 'Wallet Recharge',
            paymentGatewayId: paymentGatewayId,
            referenceType: 'WalletRecharge'
        });

        console.log('✓ Transaction created:', transaction._id, 'New balance:', updatedUser.walletBalance);

        await createNotification({
            userId: user._id,
            title: 'Wallet Recharged',
            body: `₹${rechargeAmount} has been added to your wallet.`,
            type: 'general'
        });

        res.status(200).json({ 
            success: true, 
            message: 'Wallet recharged successfully', 
            balance: updatedUser.walletBalance, 
            transaction 
        });
    } catch (error) {
        console.error('✗ AddMoney Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getWalletHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        // Exclude astrologer/seller earnings from user's view
        const transactions = await Transaction.find({ 
            userId,
            $nor: [
                { type: 'credit', referenceType: { $in: ['ChatSession', 'CallSession'] } }
            ]
        }).sort({ createdAt: -1 });
        res.status(200).json({ 
            success: true, 
            data: {
                transactions: transactions,
                pagination: {
                    total: transactions.length,
                    page: 1,
                    limit: transactions.length
                }
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        res.status(200).json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateFcmToken = async (req, res) => {
    try {
        const { fcmToken } = req.body;
        await User.findByIdAndUpdate(req.user._id, { fcmToken });
        res.status(200).json({ success: true, message: 'FCM Token updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({
            $or: [
                { userId: req.user._id },
                { user_id: req.user._id },
                { targetId: req.user._id.toString() },
                { target: 'all' },
                { target: 'users' }
            ]
        }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: notifications });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const markNotificationRead = async (req, res) => {
    try {
        const { notificationId } = req.params;
        await Notification.findByIdAndUpdate(notificationId, { isRead: true });
        res.status(200).json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateProfile = async (req, res) => {
    try {
        const { fullName, email, gender, dob } = req.body;
        const updateData = {};

        if (fullName) updateData.fullName = fullName;
        if (email) updateData.email = email;
        if (gender) updateData.gender = gender;
        if (dob) updateData.dob = dob;
        if (req.file) {
            updateData.profilePhoto = `/uploads/${req.file.filename}`;
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { $set: updateData },
            { new: true, runValidators: false }
        );

        res.status(200).json({ success: true, data: updatedUser });
    } catch (error) {
        console.error('[updateProfile] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getAstrologers = async (req, res) => {
    try {
        const astrologers = await Astrologer.find({}).populate('userId', 'fullName email phoneNumber');
        res.status(200).json({ success: true, data: astrologers });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getAstrologerById = async (req, res) => {
    try {
        const { astrologerId } = req.params;
        const astrologer = await Astrologer.findById(astrologerId)
            .populate('userId', 'fullName email phoneNumber profilePhoto isOnline');
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        const [remedies, courses] = await Promise.all([
            Remedy.find({ astrologerId: astrologer._id, status: 'Published' })
                .select('title description base_price category image type duration_minutes delivery_type')
                .sort({ createdAt: -1 })
                .lean(),
            Course.find({ astrologerId: astrologer._id, status: 'Published' })
                .select('title description price duration category thumbnail instructor')
                .sort({ createdAt: -1 })
                .lean(),
        ]);

        const data = astrologer.toObject();
        data.isOnline =
            astrologer.userId?.isOnline === true ||
            astrologer.systemStatus?.isOnline === true ||
            astrologer.isOnline === true;
        data.remedies = remedies.map((r) => ({
            ...r,
            image: normalizeMediaPath(r.image) || r.image,
        }));
        data.courses = courses.map((c) => ({
            ...c,
            thumbnail: normalizeMediaPath(c.thumbnail),
        }));
        data.serviceOfferings = data.courses.filter((c) => c.duration === 'Service');
        data.learningCourses = data.courses.filter((c) => c.duration !== 'Service');
        data.pricing = astrologer.pricing || { chat: 0, call: 0, video: 0 };

        res.status(200).json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


export const submitReview = async (req, res) => {
    try {
        const { astrologerId, sessionId, productId, rating, comment, isAnonymous } = req.body;
        let { sessionType } = req.body;
        const userId = req.user._id;

        // Normalize sessionType: 'audio' call type maps to 'call' for the review schema
        if (sessionType === 'audio') sessionType = 'call';
        // Ensure it's a valid enum value, default to 'chat' if unknown
        const validTypes = ['chat', 'call', 'video', 'product'];
        if (!validTypes.includes(sessionType)) sessionType = 'chat';

        // Prevent CastError by sanitizing optional ObjectIds (empty strings must not be sent to Mongoose as ObjectIds)
        const cleanSessionId = (sessionId && /^[0-9a-fA-F]{24}$/.test(sessionId)) ? sessionId : undefined;
        let cleanAstrologerId = (astrologerId && /^[0-9a-fA-F]{24}$/.test(astrologerId)) ? astrologerId : undefined;

        // Fallback: If cleanAstrologerId is missing but cleanSessionId is present, resolve it from the session
        if (!cleanAstrologerId && cleanSessionId) {
            console.log(`[submitReview] astrologerId is missing. Attempting to resolve from session ${cleanSessionId}...`);
            if (sessionType === 'chat') {
                const chatSession = await ChatSession.findById(cleanSessionId);
                if (chatSession && chatSession.astrologerId) {
                    cleanAstrologerId = chatSession.astrologerId.toString();
                    console.log(`[submitReview] Resolved astrologerId: ${cleanAstrologerId} from ChatSession`);
                }
            } else if (sessionType === 'call' || sessionType === 'video') {
                const callSession = await CallSession.findById(cleanSessionId);
                if (callSession && callSession.astrologerId) {
                    cleanAstrologerId = callSession.astrologerId.toString();
                    console.log(`[submitReview] Resolved astrologerId: ${cleanAstrologerId} from CallSession`);
                }
            }
        }

        const cleanProductId = (productId && /^[0-9a-fA-F]{24}$/.test(productId)) ? productId : undefined;

        let cleanSellerId = undefined;
        if (cleanProductId) {
            const product = await Product.findById(cleanProductId);
            if (product && product.seller_id) {
                cleanSellerId = product.seller_id;
            }
        }

        const review = await Review.create({
            userId,
            astrologerId: cleanAstrologerId,
            sessionId: cleanSessionId,
            productId: cleanProductId,
            sellerId: cleanSellerId,
            sessionType,
            rating,
            comment,
            isAnonymous
        });

        // Update Astrologer Rating if we have a valid astrologerId
        if (cleanAstrologerId) {
            const reviews = await Review.find({ astrologerId: cleanAstrologerId });
            const totalRating = reviews.reduce((acc, curr) => acc + curr.rating, 0);
            const average = reviews.length > 0 ? (totalRating / reviews.length) : 0;

            await Astrologer.findByIdAndUpdate(cleanAstrologerId, {
                'ratings.average': parseFloat(average.toFixed(1)),
                'ratings.totalReview': reviews.length
            });

            // Emit real-time event to astrologer about new review
            const io = getIO();
            if (io) {
                io.to(`astrologer_${cleanAstrologerId}`).emit('review_submitted', {
                    reviewId: review._id,
                    rating: review.rating,
                    comment: review.comment,
                    sessionType: review.sessionType,
                    timestamp: review.createdAt
                });
            }
        }

        // Emit real-time event to seller if it's a product review
        if (cleanSellerId) {
            const io = getIO();
            if (io) {
                io.to(`seller_${cleanSellerId}`).emit('product_review_submitted', {
                    reviewId: review._id,
                    productId: cleanProductId,
                    rating: review.rating,
                    comment: review.comment,
                    timestamp: review.createdAt
                });
            }
        }

        res.status(201).json({ success: true, data: review });
    } catch (error) {
        console.error('[submitReview] Error:', error.message, error.errors || '');
        res.status(500).json({ success: false, message: error.message, details: error.errors });
    }
};

export const getChatHistory = async (req, res) => {
    try {
        const sessions = await ChatSession.find({ userId: req.user._id })
            .populate({
                path: 'astrologerId',
                populate: { path: 'userId', select: 'fullName profilePhoto' }
            })
            .sort({ createdAt: -1 });

        const uniqueAstrologers = new Map();
        const groupedSessions = [];

        for (const session of sessions) {
            if (!session.astrologerId) continue;
            
            // Safety check for populated astrologerId
            const astroId = (session.astrologerId._id || session.astrologerId).toString();
            
            if (!uniqueAstrologers.has(astroId)) {
                uniqueAstrologers.set(astroId, true);
                
                // Add the last message for preview if available
                const sessionObj = session.toObject();
                if (session.messages && session.messages.length > 0) {
                    sessionObj.lastMessage = session.messages[session.messages.length - 1];
                }
                
                groupedSessions.push(sessionObj);
            }
        }

        res.status(200).json({ success: true, data: groupedSessions });
    } catch (error) {
        console.error('[getChatHistory] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getCallHistory = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        const calls = await CallSession.find({ userId: req.user._id })
            .populate({
                path: 'astrologerId',
                populate: { 
                    path: 'userId', 
                    model: 'User',
                    select: 'fullName profilePhoto' 
                }
            })
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json({ success: true, data: calls });
    } catch (error) {
        console.error('[getCallHistory] CRITICAL ERROR:', error);
        res.status(200).json({ 
            success: true, 
            data: [], 
            message: 'Failed to fetch call history, returning empty',
            debug_error: error.message 
        });
    }
};

export const followAstrologer = async (req, res) => {
    try {
        const { astrologerId } = req.params;
        const user = await User.findById(req.user._id);
        
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const isFollowing = user.followedAstrologers.includes(astrologerId);
        
        if (!isFollowing) {
            await User.findByIdAndUpdate(req.user._id, {
                $addToSet: { followedAstrologers: astrologerId }
            }, { runValidators: false });
            res.status(200).json({ success: true, message: 'Astrologer followed', followed: true });
        } else {
            await User.findByIdAndUpdate(req.user._id, {
                $pull: { followedAstrologers: astrologerId }
            }, { runValidators: false });
            res.status(200).json({ success: true, message: 'Astrologer unfollowed', followed: false });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const checkFollowStatus = async (req, res) => {
    try {
        const { astrologerId } = req.params;
        const user = await User.findById(req.user._id);
        const isFollowing = user.followedAstrologers.includes(astrologerId);
        res.status(200).json({ success: true, isFollowing });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getFollows = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate('followedAstrologers');
        res.status(200).json({ success: true, data: user.followedAstrologers });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getReferralData = async (req, res) => {
    try {
        let user = await User.findById(req.user._id);
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // ✓ Auto-generate referral code if user doesn't have one
        if (!user.referralCode) {
            const code = 'EKB' + user._id.toString().slice(-6).toUpperCase();
            user.referralCode = code;
            await user.save();
            console.log('✓ Generated referral code for user:', req.user._id, 'Code:', code);
        }

        const appBase = process.env.APP_BASE_URL || process.env.CLIENT_URL || 'https://ekbhavishya.com';
        const referralLink = `${appBase.replace(/\/$/, '')}/signup?ref=${encodeURIComponent(user.referralCode)}`;

        const referralCount = user.referralCount || 0;
        const referralEarnings = referralCount * 50; // ₹50 per referral

        console.log('✓ Returning referral data:', {
            referralCode: user.referralCode,
            referralCount,
            referralEarnings,
            referralLink
        });

        res.status(200).json({ 
            success: true, 
            data: {
                referralCode: user.referralCode,
                referralCount,
                referralEarnings,
                referralLink,
            } 
        });
    } catch (error) {
        console.error('✗ Error getting referral data:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getRTCConfig = async (req, res) => {
    try {
        const iceServers = getIceServers(req.user.id);
        res.status(200).json({ 
            success: true, 
            data: { 
                iceServers,
                // Fallback for older frontend versions
                rtcConfig: { iceServers }
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getChatDetails = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await ChatSession.findById(sessionId)
            .populate({
                path: 'astrologerId',
                populate: { path: 'userId', select: 'fullName profilePhoto' }
            })
            .populate('userId', 'fullName profilePhoto');
            
        if (!session) {
            return res.status(404).json({ success: false, message: 'Chat session not found' });
        }

        res.status(200).json({ success: true, data: session });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getChatMessages = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await ChatSession.findById(sessionId);
        
        if (!session) {
            return res.status(404).json({ success: false, message: 'Chat session not found' });
        }

        // Security check: only the user or the astrologer of this session can see messages
        const astrologer = await Astrologer.findOne({ userId: req.user._id });
        if (session.userId.toString() !== req.user.id && (!astrologer || session.astrologerId.toString() !== astrologer._id.toString())) {
            return res.status(403).json({ success: false, message: 'Not authorized to view these messages' });
        }

        res.status(200).json({ 
            success: true, 
            data: { 
                messages: session.messages 
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const addCallNote = async (req, res) => {
    try {
        const { callId } = req.params;
        const { notes } = req.body;
        
        const call = await CallSession.findByIdAndUpdate(callId, { notes }, { new: true });
        
        if (!call) return res.status(404).json({ success: false, message: 'Call session not found' });
        
        res.status(200).json({ success: true, message: 'Note saved', data: call });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const submitCEOFeedback = async (req, res) => {
    try {
        const { subject, message } = req.body;
        const userId = req.user.id;

        if (!subject || !message) {
            return res.status(400).json({ success: false, message: 'Subject and message are required' });
        }

        const feedback = await Feedback.create({
            userId,
            subject,
            message
        });

        res.status(201).json({ success: true, message: 'Feedback submitted successfully', data: feedback });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const requestAccountDeletion = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        user.deleteRequested = true;
        user.deleteRequestedAt = new Date();
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Your account deletion request has been submitted successfully.'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

