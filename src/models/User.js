import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, unique: true, sparse: true },
    password: { type: String },
    phoneNumber: { type: String },
    profilePhoto: { type: String },
    gender: { type: String },
    dob: { type: Date },
    role: { type: String, enum: ['user', 'astrologer', 'admin', 'seller'], default: 'user' },
    status: { type: String, enum: ['Active', 'Blocked'], default: 'Active' },
    walletBalance: { type: Number, default: 0 },
    isOnline: { type: Boolean, default: false },
    fcmToken: { type: String },
    otp: { type: String },
    otp_expiry: { type: Date },
    pendingEmail: { type: String },

    followedAstrologers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Astrologer' }],
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    referralCount: { type: Number, default: 0 },
    /** Course IDs the user has purchased/enrolled in (prevents duplicate enrollment) */
    enrolledCourses: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
    }],
    addresses: [{
        fullName: String,
        phone: String,
        addressLine1: String,
        addressLine2: String,
        city: String,
        state: String,
        pincode: String,
        type: { type: String, enum: ['home', 'office', 'other'], default: 'home' },
        isDefault: { type: Boolean, default: false }
    }],
    deleteRequested: { type: Boolean, default: false },
    deleteRequestedAt: { type: Date },
    isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

userSchema.pre('save', async function() {
    if (!this.isModified('password') || !this.password) return;
    this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = async function(candidatePassword) {
    if (!candidatePassword || !this.password) return false;
    return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.models.User || mongoose.model('User', userSchema);
