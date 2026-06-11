import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
        remedyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Remedy' },
        name: { type: String, required: true },
        price: { type: Number, required: true },
        quantity: { type: Number, default: 1 },
        itemType: { type: String, enum: ['Product', 'Remedy', 'Course', 'Pooja'], required: true }
    }],
    totalAmount: { type: Number, required: true },
    subtotal: { type: Number },
    tax: { type: Number, default: 0 },
    shipping: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'confirmed', 'processing', 'payment_pending', 'shipped', 'delivered', 'cancelled'], default: 'pending' },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'payment_pending'], default: 'paid' },
    shippingAddress: {
        fullName: String,
        phone: String,
        address: String,
        addressLine1: String,
        addressLine2: String,
        city: String,
        state: String,
        pincode: String
    },
    paymentMethod: { type: String, default: 'wallet', enum: ['wallet', 'razorpay', 'cod', 'instamojo'] },
    trackingId: { type: String },
    estimatedDelivery: { type: Date },
    deliveredAt: { type: Date },
    notes: { type: String },
    customerNotes: { type: String },
    codConfirmationSent: {
        emailSent: { type: Boolean, default: false },
        smsSent: { type: Boolean, default: false },
        sentAt: { type: Date }
    },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    sellerEarningsCredited: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.models.Order || mongoose.model('Order', orderSchema);
