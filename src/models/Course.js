import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    thumbnail: { type: String },
    price: { type: Number, required: true },
    duration: { type: String }, // e.g., '10 Hours', '4 Weeks'
    category: { type: String, default: 'General' },
    instructor: { type: String },
    astrologerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Astrologer' },
    status: { type: String, enum: ['Draft', 'Published'], default: 'Draft' },
    activeLiveSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', default: null },
    modules: [{
        title: { type: String, required: true },
        description: { type: String },
        videos: [{
            title: { type: String },
            url: { type: String },
            duration: { type: Number }
        }],
        documents: [{
            title: { type: String },
            url: { type: String },
            fileType: { type: String }
        }],
        images: [{
            title: { type: String },
            url: { type: String }
        }],
        order: { type: Number, default: 0 }
    }]
}, { timestamps: true });

export default mongoose.models.Course || mongoose.model('Course', courseSchema);
