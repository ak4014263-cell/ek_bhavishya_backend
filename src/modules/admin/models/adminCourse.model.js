import mongoose from 'mongoose';

const adminCourseSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    instructor: {
        type: String,
        required: true
    },
    isFree: {
        type: Boolean,
        default: false
    },
    price: {
        type: Number,
        default: 0
    },
    courseType: {
        type: String,
        enum: ['recorded', 'live', 'webinar'],
        default: 'recorded'
    },
    createdByAdmin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        required: true
    },
    modules: [{
        title: { type: String },
        videoUrl: { type: String },
        description: { type: String },
        duration: { type: Number }, // in minutes
        order: { type: Number }, // module sequence
    }],
    liveSchedule: {
        startTime: { type: Date },
        durationMinutes: { type: Number },
        timezone: { type: String, default: 'UTC' }
    },
    agora: {
        channelName: { type: String },
        recordingEnabled: { type: Boolean, default: false }
    },
    recording: {
        enabled: { type: Boolean, default: false },
        availabilityDays: { type: Number, default: 0 },
        recordingUrl: { type: String },
        availableUntil: { type: Date }
    },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending',
    },
    rejectionReason: {
        type: String
    },
    level: {
        type: String,
        enum: ['Beginner', 'Intermediate', 'Advanced'],
        default: 'Beginner'
    },
    category: {
        type: String,
        default: 'General'
    },
    thumbnail: {
        type: String
    },
    enrolledStudents: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    totalEnrollments: {
        type: Number,
        default: 0
    },
    rating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    totalRatings: {
        type: Number,
        default: 0
    },
    tags: [{ type: String }],
    resources: [{
        title: { type: String },
        resourceType: { type: String, enum: ['ebook', 'audiobook', 'other'] },
        fileUrl: { type: String },
        description: { type: String },
        duration: { type: Number }, // for audiobooks only
    }],
    isFeatured: {
        type: Boolean,
        default: false
    },
}, {
    timestamps: true,
});

// Index for better query performance
adminCourseSchema.index({ title: 'text', description: 'text' });
adminCourseSchema.index({ status: 1, createdAt: -1 });
adminCourseSchema.index({ category: 1 });

const AdminCourse = mongoose.models.AdminCourse || mongoose.model('AdminCourse', adminCourseSchema);
export default AdminCourse;
