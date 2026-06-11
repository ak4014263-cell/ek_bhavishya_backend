import mongoose from 'mongoose';

const InterviewSchema = new mongoose.Schema({
    astrologer_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Astrologer',
        required: true
    },
    current_phase: {
        type: Number,
        enum: [1, 2, 3],
        default: 1
    },
    phase1: {
        status: { type: String, enum: ['Pending', 'Scheduled', 'Completed', 'Rejected'], default: 'Pending' },
        meeting_link: { type: String },
        meeting_time: { type: Date },
        remarks: { type: String },
        rating: { type: Number, default: 0 },
        documents: [String]
    },
    phase2: {
        status: { type: String, enum: ['Pending', 'Scheduled', 'Completed', 'Rejected'], default: 'Pending' },
        meeting_link: { type: String },
        meeting_time: { type: Date },
        remarks: { type: String },
        rating: { type: Number, default: 0 },
        documents: [String]
    },
    phase3: {
        status: { type: String, enum: ['Pending', 'Scheduled', 'Completed', 'Rejected'], default: 'Pending' },
        meeting_link: { type: String },
        meeting_time: { type: Date },
        remarks: { type: String },
        rating: { type: Number, default: 0 },
        documents: [String]
    },
    final_status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending'
    }
}, { timestamps: true });

export default mongoose.models.Interview || mongoose.model('Interview', InterviewSchema);