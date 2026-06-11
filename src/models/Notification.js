import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Optional for broadcasts
    title: { type: String, required: true },
    body: { type: String, required: true },
    target: { type: String },
    targetId: { type: String },
    sentCount: { type: Number, default: 0 },
    sentAt: { type: Date },
    data: { type: Object },
    isRead: { type: Boolean, default: false },
    type: { type: String, default: 'general' }
}, { timestamps: true });

export default mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
