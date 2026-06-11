import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    astrologerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Astrologer' }, // Optional if it's a product review
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' }, // Added for product reviews
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, // Added for product reviews
    sessionId: { type: mongoose.Schema.Types.ObjectId }, // Optional if it's a product review
    sessionType: { type: String, enum: ['chat', 'call', 'video', 'product'], required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String },
    isAnonymous: { type: Boolean, default: false }
}, { timestamps: true });

// Index for faster lookups
reviewSchema.index({ astrologerId: 1, createdAt: -1 });

const Review = mongoose.models.Review || mongoose.model('Review', reviewSchema);
export default Review;
