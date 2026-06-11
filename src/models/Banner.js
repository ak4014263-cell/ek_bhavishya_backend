import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema({
    title: { type: String, required: true },
    target: { type: String, default: 'home' },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    icon: { type: String, default: 'image_rounded' },
    gradient: { type: String, default: 'primary' }, // We can store gradient name and map in UI
    image: { type: String },
}, { timestamps: true });

export default mongoose.models.Banner || mongoose.model('Banner', bannerSchema);
