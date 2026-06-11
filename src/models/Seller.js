import mongoose from 'mongoose';

const sellerSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    storeName: { type: String, required: true },
    business_name: { type: String },
    fullname: { type: String },
    email: { type: String },
    phone_number: { type: String },
    address: { type: String },
    city: { type: String },
    state: { type: String },
    pin_code: { type: String },
    description: { type: String },
    logo: { type: String },
    profile_image: { type: String },
    
    // Documents
    adhar_number: { type: String },
    gst_number: { type: String },
    adhar_document: { type: String },
    pan_document: { type: String },
    
    // Bank Details
    bank_account_no: { type: String },
    ifsc_code: { type: String },
    bank_holder_name: { type: String },
    
    // Status
    status: { type: String, enum: ['Active', 'Inactive', 'Blocked'], default: 'Inactive' },
    is_approved: { type: Boolean, default: false },
    is_verified: { type: Boolean, default: false },
    
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    rating: { type: Number, default: 0 },
    walletBalance: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.models.Seller || mongoose.model('Seller', sellerSchema);
