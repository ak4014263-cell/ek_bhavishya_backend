import Product from '../../../models/Product.js';

// Get all products with filters
export const getAllProducts = async (req, res) => {
    try {
        const { status, search, seller_id } = req.query;
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
        const skip = (page - 1) * limit;

        const filter = {};
        
        if (status) {
            filter.status = status;
        }
        
        if (seller_id) {
            filter.seller_id = seller_id;
        }
        
        if (search) {
            filter.$or = [
                { product_name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        const [products, total] = await Promise.all([
            Product.find(filter)
                .populate('seller_id', 'business_name fullname email phone_number')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Product.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            data: products,
            pagination: {
                total,
                page,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get All Products Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

// Get product by ID
export const getProductById = async (req, res) => {
    try {
        const { id } = req.params;

        const product = await Product.findById(id)
            .populate('seller_id', 'business_name fullname email phone_number address')
            .populate('category_id', 'name');

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        res.status(200).json({ success: true, product });
    } catch (error) {
        console.error('Get Product By ID Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

// Approve/Publish product (Draft or Out of Stock → Published)
export const approveProduct = async (req, res) => {
    try {
        const { id } = req.params;

        const product = await Product.findByIdAndUpdate(
            id,
            { 
                status: 'Published', 
                is_verified: true, 
                is_listed: true,
                rejectionReason: null 
            },
            { new: true }
        ).populate('seller_id', 'business_name fullname email')
        .populate('category_id', 'name');

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        res.status(200).json({
            success: true,
            message: 'Product published successfully and is now live.',
            product,
        });
    } catch (error) {
        console.error('Approve Product Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

// Reject product (Set to Out of Stock and hide from listing)
export const rejectProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const rejectionReason = req.body?.rejectionReason || null;

        // rejectionReason is optional - admin can reject without providing a reason

        const product = await Product.findByIdAndUpdate(
            id,
            { 
                status: 'Out of Stock', 
                is_verified: false,
                is_listed: false,
                rejectionReason
            },
            { new: true }
        ).populate('seller_id', 'business_name fullname email')
        .populate('category_id', 'name');

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        res.status(200).json({
            success: true,
            message: 'Product rejected and marked as Out of Stock.',
            product,
        });
    } catch (error) {
        console.error('Reject Product Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

// Revert product to Draft status (give seller another chance to fix it)
export const revertProduct = async (req, res) => {
    try {
        const { id } = req.params;

        const product = await Product.findById(id);
        
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        if (product.status === 'Draft') {
            return res.status(400).json({
                success: false,
                message: 'Product status is already Draft.',
            });
        }

        product.status = 'Draft';
        product.is_listed = false;
        product.is_verified = false;
        product.rejectionReason = null;
        await product.save();

        await product.populate('seller_id', 'business_name fullname email');
        await product.populate('category_id', 'name');

        res.status(200).json({
            success: true,
            message: 'Product reverted to Draft status. Seller can resubmit.',
            product,
        });
    } catch (error) {
        console.error('Revert Product Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

// Edit product
export const editProduct = async (req, res) => {
    try {
        const { id } = req.params;

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        const {
            product_name,
            description,
            base_price,
            selling_price,
            stock_count,
            stock,
            category_id,
            status,
            is_listed,
            is_verified,
            refund_policy
        } = req.body;

        // Update editable fields
        if (product_name !== undefined) product.product_name = product_name;
        if (description !== undefined) product.description = description;
        if (base_price !== undefined) product.base_price = base_price;
        if (selling_price !== undefined) product.selling_price = selling_price;
        if (stock !== undefined) product.stock = stock;
        if (stock_count !== undefined) product.stock = stock_count;
        if (category_id !== undefined) product.category_id = category_id;
        if (status !== undefined) product.status = status;
        if (is_listed !== undefined) product.is_listed = is_listed;
        if (is_verified !== undefined) product.is_verified = is_verified;
        if (refund_policy !== undefined) product.refund_policy = refund_policy;

        const updatedProduct = await product.save();
        await updatedProduct.populate('seller_id', 'business_name fullname email');
        await updatedProduct.populate('category_id', 'name');

        res.status(200).json({
            success: true,
            message: 'Product updated successfully.',
            product: updatedProduct
        });
    } catch (error) {
        console.error('Edit Product Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

// Delete product
export const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;

        const product = await Product.findByIdAndDelete(id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        res.status(200).json({
            success: true,
            message: 'Product deleted successfully.',
            product
        });
    } catch (error) {
        console.error('Delete Product Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};
const productController = {
    getAllProducts,
    getProductById,
    approveProduct,
    rejectProduct,
    revertProduct,
    editProduct,
    deleteProduct,
    createProduct: async (req, res) => {
        try {
            const productData = { ...req.body };
            if (req.files) {
                productData.product_images = req.files.map(file => `/uploads/${file.filename}`);
            }
            // Admin defaults
            productData.status = 'Published';
            productData.is_verified = true;
            productData.is_listed = true;
            
            // Fix: set base_price if only selling_price is provided (it is required in model)
            if (productData.selling_price && !productData.base_price) {
                productData.base_price = productData.selling_price;
            }

            const Product = (await import('../../../models/Product.js')).default;
            const product = await Product.create(productData);
            
            res.status(201).json({ success: true, message: 'Product created successfully', data: product });
        } catch (error) {
            console.error('Create Product Error:', error);
            res.status(400).json({ success: false, message: error.message || 'Internal Server Error' });
        }
    }
};

export default productController;
