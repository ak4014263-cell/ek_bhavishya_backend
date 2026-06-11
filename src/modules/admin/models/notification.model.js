import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    notice_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Notice',
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: [
        'platform_policy', 
        'downtime_alert', 
        'payment_notice', 
        'warning_strike', 
        'appreciation_message',
        'incoming_call',
        'call_accepted',
        'call_rejected',
        'low_balance_warning',
        'call_ended'
      ],
      default: 'platform_policy',
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Index for quick user lookups and sorting
notificationSchema.index({ user_id: 1, createdAt: -1 });
notificationSchema.index({ user_id: 1, isRead: 1 });

const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
export default Notification;
