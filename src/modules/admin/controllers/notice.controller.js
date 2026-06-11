/**
 * Unified Notice Controller - Proper separation of Notice + Notification
 * 
 * Notice = Admin Content (title, message, created_by)
 * Notification = User Delivery (created when notice is created/updated, deleted when notice is deleted)
 */

import Notice, { NoticeUsers } from '../models/notice.model.js';
import Notification from '../../../models/Notification.js';
import { sendEmailNotification, saveInAppNotification, createNotification } from '../../../utils/notificationService.js';
import Seller from '../../../models/Seller.js';
import Astrologer from '../../../models/Astrologer.js';



export const createNotice = async (req, res) => {
  try {
    const adminId = req.admin?.id;
    if (!adminId) return res.status(401).json({ success: false, message: 'Unauthorized - Admin authentication required' });

    const {
      title,
      message,
      user_ids,
      type = 'announcement',
      push_notification = true,
      email_notification = true,
      in_app_notification = true,
      schedule_send = null
    } = req.body;

    // Validation
    if (!title || title.trim() === '') {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }
    if (!message || message.trim() === '') {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }
    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'user_ids array is required and must not be empty' });
    }

    // Validate notification channels - at least one must be true
    if (!push_notification && !email_notification && !in_app_notification) {
      return res.status(400).json({
        success: false,
        message: 'At least one notification channel (push, email, or in_app) must be enabled'
      });
    }

    // Validate type
    const validTypes = ['platform_policy', 'downtime_alert', 'payment_notice', 'warning_strike', 'appreciation_message'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    // Validate schedule_send if provided
    let scheduledTime = null;
    if (schedule_send) {
      scheduledTime = new Date(schedule_send);
      if (isNaN(scheduledTime)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid schedule_send date format. Use ISO 8601 format (e.g., 2026-01-31T02:00:00Z)'
        });
      }
      if (scheduledTime < new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Scheduled time cannot be in the past'
        });
      }
    }

    // Create notice and save to MongoDB
    const notice = new Notice({
      title: title.trim(),
      message: message.trim(),
      type,
      push_notification,
      email_notification,
      in_app_notification,
      schedule_send: scheduledTime,
      sent: scheduledTime ? false : true,
      created_by: adminId,
      sentCount: user_ids.length,
    });

    // Explicitly save notice to database
    const savedNotice = await notice.save();
    console.log(`Notice created and saved to MongoDB with ID: ${savedNotice._id}`);

    // Map users to notice
    const noticeUsersMaps = user_ids.map(userId => ({
      notice_id: savedNotice._id,
      user_id: userId,
    }));

    // Save notice-user mappings
    const savedMappings = await NoticeUsers.insertMany(noticeUsersMaps);
    console.log(`Created ${savedMappings.length} notice-user mappings in MongoDB`);

    // Create notifications for each user (only if not scheduled)
    let savedNotifications = [];
    let emailResults = [];
    let inAppResults = [];

    if (!scheduledTime) {
      // Fetch user details for email and FCM sending
      const sellers = await Seller.find({ _id: { $in: user_ids } }).select('userId email fullname');
      const astrologers = await Astrologer.find({ _id: { $in: user_ids } }).select('userId email name');
      const allUsers = [...sellers, ...astrologers];

      // Parallelize sending to improve performance
      const sendPromises = allUsers.map(async (user) => {
        if (!user || (!user.userId && !user._id)) return;
        const targetUserId = user.userId || user._id;

        // 1. Send via Unified Notification Service (Socket + FCM + DB)
        try {
          await createNotification({
            userId: targetUserId,
            title: title.trim(),
            body: message.trim(),
            type: 'general',
            data: { noticeId: savedNotice._id.toString() }
          });
          inAppResults.push({ success: true });
        } catch (err) {
          console.error(`Failed to send notification to user ${targetUserId}:`, err.message);
          inAppResults.push({ success: false, error: err.message });
        }

        // 2. Send email if enabled
        if (email_notification && user.email) {
          try {
            const emailResult = await sendEmailNotification(
              user.email,
              title.trim(),
              message.trim(),
              type
            );
            emailResults.push(emailResult);
          } catch (err) {
            console.error(`Failed to send email to ${user.email}:`, err.message);
            emailResults.push({ success: false, error: err.message });
          }
        }
      });

      // We don't necessarily need to wait for all to finish before responding, 
      // but to give accurate counts we wait here. Parallel execution is much faster than serial.
      await Promise.allSettled(sendPromises);
    }


    return res.status(201).json({
      success: true,
      message: scheduledTime
        ? `Notice scheduled successfully. Will be sent to ${user_ids.length} users at ${scheduledTime.toISOString()}`
        : `Notice created and sent immediately to ${user_ids.length} users.`,
      data: {
        notice: {
          id: savedNotice._id,
          title: savedNotice.title,
          message: savedNotice.message,
          type: savedNotice.type,
          sentCount: savedNotice.sentCount,
          channels: {
            push: push_notification,
            email: email_notification,
            in_app: in_app_notification
          },
          scheduled: scheduledTime ? scheduledTime.toISOString() : null,
          createdAt: savedNotice.createdAt,
        },
        mappingsCreated: savedMappings.length,
        notificationsCreated: savedNotifications.length,
        emailsSent: emailResults.filter(r => r.success).length,
        inAppNotificationsSaved: inAppResults.filter(r => r.success).length,
      },
    });
  } catch (err) {
    console.error('Error creating notice:', err.message);

    // Handle validation errors
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: 'Validation error', details: messages });
    }

    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getNotices = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const skip = (page - 1) * limit;

    const notices = await Notice.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('created_by', 'name email')
      .lean();

    const total = await Notice.countDocuments();

    return res.json({
      success: true,
      pagination: { total, page, pages: Math.ceil(total / limit) },
      data: notices,
    });
  } catch (err) {
    console.error('Error fetching notices:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getNoticeById = async (req, res) => {
  try {
    const { noticeId } = req.body;
    if (!noticeId) return res.status(400).json({ success: false, message: 'Notice ID is required' });

    const notice = await Notice.findById(noticeId).populate('created_by', 'name email').lean();
    if (!notice) return res.status(404).json({ success: false, message: 'Notice not found' });

    // Get all users this notice was sent to
    const sentUsers = await NoticeUsers.find({ notice_id: noticeId }, 'user_id').lean();

    return res.json({
      success: true,
      data: {
        ...notice,
        user_ids: sentUsers.map(u => u.user_id),
      },
    });
  } catch (err) {
    console.error('Error fetching notice:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const updateNotice = async (req, res) => {
  try {
    const adminId = req.admin?.id;
    if (!adminId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { noticeId, title, message, user_ids } = req.body;
    if (!noticeId) return res.status(400).json({ success: false, message: 'Notice ID is required' });

    const notice = await Notice.findById(noticeId);
    if (!notice) return res.status(404).json({ success: false, message: 'Notice not found' });

    // Update notice fields
    if (title) notice.title = title;
    if (message) notice.message = message;
    if (user_ids) notice.sentCount = user_ids.length;

    await notice.save();

    // If user_ids provided, update notice-users mapping and re-notify
    if (user_ids && Array.isArray(user_ids)) {
      // Delete old mappings
      await NoticeUsers.deleteMany({ notice_id: noticeId });

      // Delete old notifications
      await Notification.deleteMany({ notice_id: noticeId });

      // Create new mappings
      const newMaps = user_ids.map(userId => ({
        notice_id: noticeId,
        user_id: userId,
      }));
      await NoticeUsers.insertMany(newMaps);

      // Create new notifications (re-notify)
      const newNotifications = user_ids.map(userId => ({
        user_id: userId,
        notice_id: noticeId,
        title: notice.title,
        message: notice.message,
        type: 'GENERAL',
        isRead: false,
      }));
      await Notification.insertMany(newNotifications);
    }

    return res.status(200).json({
      success: true,
      message: `Notice updated and ${user_ids ? `re-sent to ${user_ids.length} users` : 'saved'}.`,
      notice: {
        id: notice._id,
        title: notice.title,
        message: notice.message,
        sentCount: notice.sentCount,
      },
    });
  } catch (err) {
    console.error('Error updating notice:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteNotice = async (req, res) => {
  try {
    const adminId = req.admin?.id;
    if (!adminId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { noticeId } = req.body;
    if (!noticeId) return res.status(400).json({ success: false, message: 'Notice ID is required' });

    const notice = await Notice.findByIdAndDelete(noticeId);
    if (!notice) return res.status(404).json({ success: false, message: 'Notice not found' });

    // Delete notice-user mappings
    await NoticeUsers.deleteMany({ notice_id: noticeId });

    // Delete all notifications for this notice
    const deleteResult = await Notification.deleteMany({ notice_id: noticeId });

    return res.status(200).json({
      success: true,
      message: 'Notice deleted and all notifications removed.',
      deletedNotificationCount: deleteResult.deletedCount,
    });
  } catch (err) {
    console.error('Error deleting notice:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getNotificationsByNotice = async (req, res) => {
  try {
    const { noticeId } = req.body;
    if (!noticeId) return res.status(400).json({ success: false, message: 'Notice ID is required' });
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const skip = (page - 1) * limit;

    const notice = await Notice.findById(noticeId);
    if (!notice) return res.status(404).json({ success: false, message: 'Notice not found' });

    const notifications = await Notification.find({ notice_id: noticeId })
      .populate('user_id', 'fullName email phoneNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Notification.countDocuments({ notice_id: noticeId });

    return res.json({
      success: true,
      data: notifications,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Error fetching notifications:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export default {
  createNotice,
  getNotices,
  getNoticeById,
  updateNotice,
  deleteNotice,
  getNotificationsByNotice,
};
