import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Can be null if it's an astrologer/seller credit
    astrologerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Astrologer' }, // Can be null if it's a user recharge/seller
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' }, // Added for seller earnings/payouts
    amount: { type: Number, required: true },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    status: { type: String, enum: ['pending', 'processing', 'paid', 'rejected', 'completed', 'failed'], default: 'completed' },
    description: { type: String },
    referenceId: { type: mongoose.Schema.Types.ObjectId }, // e.g., SessionId or OrderId
    referenceType: { type: String, enum: ['CallSession', 'ChatSession', 'WalletRecharge', 'Remedy', 'Product', 'Course', 'PoojaBooking', 'Order', 'Withdrawal'] },
    paymentGatewayId: { type: String },
}, { timestamps: true });

export default mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
