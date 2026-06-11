import mongoose from 'mongoose';

const noticeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Notice title is required'],
      trim: true,
    },
    message: {
      type: String,
      required: [true, 'Notice message is required'],
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
    type: {
      type: String,
      enum: ['platform_policy', 'downtime_alert', 'payment_notice', 'warning_strike', 'appreciation_message'],
      default: 'platform_policy',
    },
    push_notification: {
      type: Boolean,
      default: false,
    },
    email_notification: {
      type: Boolean,
      default: false,
    },
    in_app_notification: {
      type: Boolean,
      default: false,
    },
    schedule_send: {
      type: Date,
      default: null,
    },
    sent: {
      type: Boolean,
      default: false,
    },
    sentCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

noticeSchema.index({ created_by: 1, createdAt: -1 });
noticeSchema.index({ createdAt: -1 });

const noticeUsersSchema = new mongoose.Schema(
  {
    notice_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Notice',
      required: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
  },
  { timestamps: true }
);

noticeUsersSchema.index({ notice_id: 1, user_id: 1 });
noticeUsersSchema.index({ notice_id: 1 });

const Notice = mongoose.models.Notice || mongoose.model('Notice', noticeSchema);
const NoticeUsers = mongoose.models.NoticeUsers || mongoose.model('NoticeUsers', noticeUsersSchema);

export { Notice, NoticeUsers };
export default Notice;
