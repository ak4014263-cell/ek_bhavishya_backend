import mongoose from 'mongoose';

const trainingModuleSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    duration: { type: String },
    videoUrl: { type: String },
    thumbnail: { type: String },
    hasAssignment: { type: Boolean, default: false },
    assignmentTitle: { type: String },
    assignmentDesc: { type: String },
    dueDate: { type: String },
    resources: [{
        title: { type: String },
        type: { type: String },
        url: { type: String },
    }],
    certifications: [{
        title: { type: String },
        description: { type: String },
        url: { type: String },
        imageUrl: { type: String },
    }],
    category: { type: String, default: 'General' },
    sortOrder: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.models.TrainingModule || mongoose.model('TrainingModule', trainingModuleSchema);
