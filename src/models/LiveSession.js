import mongoose from 'mongoose';

const liveSessionSchema = new mongoose.Schema({
    astrologerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Astrologer', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
    sessionType: { type: String, enum: ['public', 'masterclass'], default: 'public' },
    title: { type: String, required: true },
    category: { type: String, default: 'General' },
    status: { type: String, enum: ['scheduled', 'active', 'ended'], default: 'active' },
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date },
    viewers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    maxViewers: { type: Number, default: 0 }, // For stats
    currentViewersCount: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

const LiveSession = mongoose.models.LiveSession || mongoose.model('LiveSession', liveSessionSchema);
export default LiveSession;
