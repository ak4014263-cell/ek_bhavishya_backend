import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
    product_name: { type: String, required: true },
    description: { type: String },
    base_price: { type: Number, required: true },
    selling_price: { type: Number, required: true },
    product_images: [{ type: String }],
    category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    seller_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
    stock: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.models.Product || mongoose.model('Product', productSchema);
