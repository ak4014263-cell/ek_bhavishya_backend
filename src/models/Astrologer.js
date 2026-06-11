import mongoose from 'mongoose';

const astrologerSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    personalDetails: {
        name: { type: String },
        email: { type: String },
        phone: { type: String },
        pseudonym: { type: String },
        profileImage: { type: String },
        about: { type: String },
        experience: { type: Number, default: 0 },
        languages: [{ type: String }],
        skills: [{ type: String }],
        categories: [{ type: String }]
    },
    profileEnhancement: {
        bio: { type: String },
        videoIntro: { type: String },
        voiceMessage: { type: String }
    },
    verificationStatus: { type: String, enum: ['Pending', 'Verified', 'Rejected'], default: 'Pending' },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Suspended'], default: 'Pending' },
    approvedAt: { type: Date },
    pricingUpdateRequest: {
        chat: { type: Number },
        call: { type: Number },
        video: { type: Number },
        status: { type: String, enum: ['Pending', 'Approved', 'Rejected'] },
        requestedAt: { type: Date }
    },
    rejectionReason: { type: String },
    pricing: {
        chat: { type: Number, default: 0 },
        call: { type: Number, default: 0 },
        video: { type: Number, default: 0 }
    },
    availability: {
        status: { type: String, enum: ['online', 'offline', 'busy'], default: 'offline' },
        isChatAvailable: { type: Boolean, default: true },
        isCallAvailable: { type: Boolean, default: true },
        isVideoAvailable: { type: Boolean, default: true },
        isFreeChatAvailable: { type: Boolean, default: false },
        lastOnlineAt: { type: Date },
        nextAvailableAt: { type: Date }
    },
    callSettings: {
        audioCallRate: { type: Number, default: 0 },
        videoCallRate: { type: Number, default: 0 },
        acceptAudioCalls: { type: Boolean, default: true },
        acceptVideoCalls: { type: Boolean, default: true }
    },
    ratings: {
        average: { type: Number, default: 0 },
        totalReview: { type: Number, default: 0 }
    },
    systemStatus: {
        isOnline: { type: Boolean, default: false },
        isApproved: { type: Boolean, default: true }
    },
    walletBalance: { type: Number, default: 0 },
    notificationSettings: {
        chat: { type: Boolean, default: true },
        call: { type: Boolean, default: true },
        review: { type: Boolean, default: true },
        priceIncrease: { type: Boolean, default: false },
        billing: { type: Boolean, default: true },
        bank: { type: Boolean, default: true }
    },
    privacySettings: {
        profileVisibility: { type: Boolean, default: true }
    },
    sampleReading: {
        fileUrl: { type: String },
        fileType: { type: String }, // 'pdf', 'audio', 'text'
        fileName: { type: String },
        uploadedAt: { type: Date }
    },
    addressDetails: {
        addressLine: { type: String },
        city: { type: String },
        state: { type: String },
        zip: { type: String }
    },
    documents: {
        aadharCard: { type: String },
        panCard: { type: String },
        educationalCertificates: [{ type: String }],
        interviewDocuments: [{ type: String }]
    },
    website: {
        name: { type: String },
        about: { type: String },
        bannerImage: { type: String },
        logo: { type: String },
        isLive: { type: Boolean, default: false },
        showEmail: { type: Boolean, default: true },
        showPhone: { type: Boolean, default: true },
        themeColor: { type: String, default: '#BB6BDE' }
    },
    certificates: [{
        title: { type: String },
        url: { type: String },
        issueDate: { type: Date, default: Date.now }
    }],
    bankDetails: {
        bankName: { type: String },
        accountNumber: { type: String },
        ifscCode: { type: String },
        accountHolderName: { type: String },
        upiId: { type: String }
    },
    trainingEnrollment: {
        masterclassRegistered: { type: Boolean, default: false },
        masterclassRegisteredAt: { type: Date },
        assignmentSubmissions: [{
            moduleId: { type: String },
            notes: { type: String },
            fileUrl: { type: String },
            submittedAt: { type: Date }
        }]
    }

}, { timestamps: true });

export default mongoose.models.Astrologer || mongoose.model('Astrologer', astrologerSchema);
