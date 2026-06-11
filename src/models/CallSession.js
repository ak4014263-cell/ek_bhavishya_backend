import mongoose from 'mongoose';

const callSessionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    astrologerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Astrologer', required: true },
    callType: { type: String, enum: ['audio', 'video'], required: true },
    status: { type: String, enum: ['ringing', 'connecting', 'active', 'ended', 'no_answer', 'rejected'], default: 'ringing' },
    startTime: { type: Date },
    endTime: { type: Date },
    duration: { type: Number, default: 0 }, // in seconds
    cost: { type: Number, default: 0 },
    rating: { type: Number },
    review: { type: String },
    notes: { type: String }
}, { timestamps: true });

export default mongoose.models.CallSession || mongoose.model('CallSession', callSessionSchema);
