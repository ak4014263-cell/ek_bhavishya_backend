import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { getIO } from '../socket/socketManager.js';
import { messaging } from '../config/firebase.js';
import { sendEmail } from './emailService.js';

/**
 * Create a notification and emit it to the user via socket and FCM
 * @param {Object} params - Notification parameters
 * @param {string} params.userId - Recipient user ID
 * @param {string} params.title - Notification title
 * @param {string} params.body - Notification message body
 * @param {string} params.type - Notification type
 * @param {Object} [params.data] - Additional data for the notification
 * @returns {Promise<Object>} The created notification
 */
export const createNotification = async ({ userId, title, body, type, data }) => {
    try {
        const notification = await Notification.create({
            userId,
            title,
            body,
            type: type || 'general',
            isRead: false,
            data,
            createdAt: new Date()
        });

        // 1. Emit via Socket if available
        try {
            const io = getIO();
            io.to(`user_${userId}`).emit('notification', {
                notification: {
                    _id: notification._id,
                    title: notification.title,
                    body: notification.body,
                    type: notification.type,
                    isRead: notification.isRead,
                    createdAt: notification.createdAt,
                    data: notification.data
                }
            });
        } catch (socketErr) {
            console.error('Failed to emit notification via socket:', socketErr.message);
        }

        // 2. Send via FCM if token exists
        try {
            const user = await User.findById(userId).select('fcmToken');
            if (user && user.fcmToken) {
                const message = {
                    token: user.fcmToken,
                    notification: {
                        title: title,
                        body: body,
                    },
                    data: {
                        type: type || 'general',
                        notificationId: notification._id.toString(),
                        ...(data || {})
                    },
                    android: {
                        priority: 'high',
                        notification: {
                            channelId: 'default',
                            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
                        }
                    },
                    apns: {
                        payload: {
                            aps: {
                                sound: 'default',
                                badge: 1,
                            }
                        }
                    }
                };

                await messaging.send(message);
                console.log(`[FCM] Sent notification to user ${userId}`);
            }
        } catch (fcmErr) {
            console.error('[FCM] Error sending message:', fcmErr.message);
        }

        return notification;
    } catch (err) {
        console.error('Failed to create notification:', err.message);
        throw err;
    }
};

/**
 * Helper for notice controller - Save an in-app notification
 */
export const saveInAppNotification = async (userId, noticeId, title, body, type) => {
    try {
        await Notification.create({
            userId,
            notice_id: noticeId,
            title,
            body,
            type: type || 'general',
            isRead: false
        });
        return { success: true };
    } catch (error) {
        console.error('saveInAppNotification Error:', error.message);
        return { success: false, error: error.message };
    }
};

/**
 * Helper for notice controller - Send an email notification
 */
export const sendEmailNotification = async (email, title, body, type) => {
    try {
        const result = await sendEmail({
            to: email,
            subject: title,
            html: `<p>${body}</p>`
        });
        return result;
    } catch (error) {
        console.error('sendEmailNotification Error:', error.message);
        return { success: false, error: error.message };
    }
};
/**
 * Broadcast notification to multiple users
 * @param {string} target - 'all', 'users', or 'astrologers'
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {Object} [data] - Additional data
 */
export const broadcastNotification = async (target, title, body, data = {}) => {
    try {
        const query = {};
        if (target === 'users') query.role = 'user';
        else if (target === 'astrologers') query.role = 'astrologer';

        const users = await User.find(query).select('_id fcmToken');
        
        // 1. Emit via Socket to all connected users
        const io = getIO();
        if (io) {
            io.emit('broadcast_notification', {
                title, body, target, data
            });
        }

        // 2. Bulk insert notifications for database history (User side)
        const notificationsData = users.map(u => ({
            userId: u._id,
            title,
            body,
            type: 'general',
            data,
            isRead: false
        }));

        // Use insertMany for efficiency
        if (notificationsData.length > 0) {
            await Notification.insertMany(notificationsData);
        }

        // 3. Send FCM in background (don't block the response)
        const fcmTokens = users.filter(u => u.fcmToken).map(u => u.fcmToken);
        if (fcmTokens.length > 0) {
            // Send in chunks of 500 (FCM limit)
            const sendFCMInChunks = async () => {
                for (let i = 0; i < fcmTokens.length; i += 500) {
                    const chunk = fcmTokens.slice(i, i + 500);
                    const message = {
                        notification: { title, body },
                        data: { ...data, type: 'general' },
                        tokens: chunk,
                        android: { priority: 'high' }
                    };
                    try {
                        await messaging.sendEachForMulticast(message);
                    } catch (e) {
                        console.error('FCM Multicast error:', e.message);
                    }
                }
            };
            sendFCMInChunks(); // Background task
        }

        return { success: true, count: users.length };
    } catch (err) {
        console.error('Broadcast notification failed:', err.message);
        throw err;
    }
};
