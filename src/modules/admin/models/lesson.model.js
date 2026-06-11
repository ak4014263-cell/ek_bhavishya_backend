import mongoose from 'mongoose';

const lessonSchema = new mongoose.Schema({
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'courseType'
    },
    courseType: {
        type: String,
        required: true,
        enum: ['AdminCourse', 'Course']
    },
    moduleName: {
        type: String,
        required: true
    },
    moduleId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    duration: {
        type: Number // in minutes
    },
    order: {
        type: Number,
        required: true
    },
    content: [{
        url: { type: String, required: true },
        type: { type: String, enum: ['video', 'image', 'pdf', 'doc', 'other'], required: true }
    }]
}, {
    timestamps: true
});

// Index for quick module lookup
lessonSchema.index({ courseId: 1, moduleId: 1, moduleName: 1, order: 1 });

const Lesson = mongoose.models.Lesson || mongoose.model('Lesson', lessonSchema);
export default Lesson;
