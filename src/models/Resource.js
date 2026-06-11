import mongoose from 'mongoose';

const resourceSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    type: { type: String, enum: ['pdf', 'video', 'link', 'document', 'image'], required: true },
    url: { type: String, required: true },
    thumbnail: { type: String },
    category: { type: String, default: 'General' },
}, { timestamps: true });

export default mongoose.models.Resource || mongoose.model('Resource', resourceSchema);
