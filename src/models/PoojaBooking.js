import mongoose from 'mongoose';

const poojaBookingSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    astrologerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Astrologer', required: true },
    poojaType: { type: String, required: true }, // e.g., 'Ganesh Pooja', 'Personal Pooja'
    status: { type: String, enum: ['pending', 'scheduled', 'completed', 'cancelled'], default: 'pending' },
    scheduledDate: { type: Date },
    amount: { type: Number, required: true },
    description: { type: String },
    notes: { type: String }
}, { timestamps: true });

export default mongoose.models.PoojaBooking || mongoose.model('PoojaBooking', poojaBookingSchema);
