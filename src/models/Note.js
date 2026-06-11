import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema({
    astrologerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Astrologer', required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    date: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.models.Note || mongoose.model('Note', noteSchema);
