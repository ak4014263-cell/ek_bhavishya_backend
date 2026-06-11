import mongoose from 'mongoose';

const remedySchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    image: { type: String },
    base_price: { type: Number, default: 0 },
    type: { type: String }, // e.g., 'gemstone', 'pooja', 'mantra'
    videoUrl: { type: String },
    hasLivePooja: { type: Boolean, default: false },
    livePoojaLink: { type: String },
    livePoojaTime: { type: String },
    astrologerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Astrologer' },
    status: { type: String, enum: ['Draft', 'Published'], default: 'Draft' }
}, { timestamps: true });

export default mongoose.models.Remedy || mongoose.model('Remedy', remedySchema);
