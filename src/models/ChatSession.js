import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema({
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderType: { type: String, enum: ['user', 'astrologer'], required: true },
    content: { type: String },
    type: { type: String, enum: ['text', 'image', 'document', 'note'], default: 'text' },
    attachments: [{ type: String }],
    status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
    timestamp: { type: Date, default: Date.now }
});

const chatSessionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    astrologerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Astrologer', required: true },
    status: { type: String, enum: ['pending', 'active', 'ended', 'cancelled'], default: 'pending' },
    messages: [chatMessageSchema],
    notes: [{
        content: String,
        timestamp: { type: Date, default: Date.now }
    }],
    startTime: { type: Date },
    endTime: { type: Date },
    duration: { type: Number, default: 0 },
    cost: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.models.ChatSession || mongoose.model('ChatSession', chatSessionSchema);
