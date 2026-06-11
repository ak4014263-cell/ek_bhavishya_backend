import mongoose from 'mongoose';

const blogSchema = new mongoose.Schema({
    title: { type: String, required: true },
    slug: { type: String, lowercase: true, trim: true },
    summary: { type: String },
    content: { type: String, required: true },
    category: { type: String, default: 'General' },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    astrologerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Astrologer' },
    imageUrl: { type: String, default: 'https://picsum.photos/800/400' },
    image: { type: String },
    author: { type: mongoose.Schema.Types.ObjectId, refPath: 'authorType' },
    authorType: { type: String, enum: ['Admin', 'Astrologer', 'User'] },
    createdByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    adminName: { type: String },
    adminEmail: { type: String },
    status: { type: String, default: 'Pending' },
    rejectionReason: { type: String },
    tags: [{ type: String }],
    views: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.models.Blog || mongoose.model('Blog', blogSchema);
