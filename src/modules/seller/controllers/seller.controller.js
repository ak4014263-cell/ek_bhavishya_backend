import User from '../../../models/User.js';
import Seller from '../../../models/Seller.js';
import Product from '../../../models/Product.js';
import Order from '../../../models/Order.js';
import Transaction from '../../../models/Transaction.js';
import Review from '../../../models/Review.js';
import Notification from '../../../models/Notification.js';
import Admin from '../../admin/models/admin.model.js';
import jwt from 'jsonwebtoken';
import { creditSellersForOrder } from '../../../utils/sellerEarnings.js';
import { broadcastOrderStatusChange } from '../../../utils/orderEvents.js';
import { createNotification } from '../../../utils/notificationService.js';
import fs from 'fs';
import path from 'path';
import {
    normalizeStoredUploadPath,
    resolvePublicMediaUrl,
    resolveLocalUploadFile,
    multerFileToUploadPath,
} from '../../../utils/uploadPaths.js';
import { normalizeEmail, emailLookupRegex } from '../../../utils/authEmail.js';

const generateToken = (id) => {
    const secret = process.env.JWT_SECRET || 'secret';
    return jwt.sign({ id }, secret, { expiresIn: '30d' });
};

const resolveMediaUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    const base = process.env.APP_BASE_URL || process.env.CLIENT_URL || 'http://localhost:5001';
    return `${base.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
};

const formatProduct = (product) => {
    const plain = product.toObject ? product.toObject() : { ...product };
    plain.product_images = (plain.product_images || []).map((img) => resolveMediaUrl(img));
    return plain;
};

/** Resolve User for seller login (email on User or legacy Seller.email). */
const findSellerUserByEmail = async (email) => {
    const emailRegex = emailLookupRegex(email);
    if (!emailRegex) return null;

    let user = await User.findOne({ email: emailRegex });
    if (user) return user;

    const sellerDoc = await Seller.findOne({
        $or: [{ email: emailRegex }, { email: normalizeEmail(email) }],
    });
    if (sellerDoc?.userId) {
        user = await User.findById(sellerDoc.userId);
    }
    return user;
};

/** Fill required seller fields from User when repairing legacy/orphan rows. */
const applySellerDefaultsFromUser = (seller, user) => {
    const label =
        user.fullName ||
        seller.fullname ||
        seller.business_name ||
        (user.email ? user.email.split('@')[0] : null) ||
        'My Store';
    if (!seller.storeName) seller.storeName = label;
    if (!seller.business_name) seller.business_name = seller.storeName;
    if (!seller.fullname) seller.fullname = user.fullName || label;
    if (!seller.email && user.email) seller.email = normalizeEmail(user.email);
    if (!seller.phone_number && user.phoneNumber) seller.phone_number = user.phoneNumber;
    if (!seller.status) seller.status = 'Inactive';
    if (seller.is_approved === undefined) seller.is_approved = false;
};

/** Ensure a Seller row exists; reuse orphan rows matched by email (avoids E11000 on email_1). */
const getOrCreateSeller = async (user) => {
    const userId = user._id ?? user.id;
    const normalizedEmail = normalizeEmail(user.email);

    let seller = await Seller.findOne({ userId });
    if (seller) {
        applySellerDefaultsFromUser(seller, user);
        if (seller.isModified()) await seller.save();
        return seller;
    }

    if (normalizedEmail) {
        const emailRegex = emailLookupRegex(user.email);
        seller = await Seller.findOne({
            $or: [
                { email: normalizedEmail },
                ...(emailRegex ? [{ email: emailRegex }] : []),
            ],
        });
        if (seller) {
            console.log(`[Seller] Linking seller ${seller._id} → user ${userId} (${normalizedEmail})`);
            seller.userId = userId;
            seller.email = normalizedEmail;
            applySellerDefaultsFromUser(seller, user);
            await seller.save();
            return seller;
        }
    }

    try {
        console.log('✓ Creating new seller entry for user:', userId);
        seller = await Seller.create({
            userId,
            storeName: user.fullName || 'My Store',
            business_name: user.fullName || 'My Store',
            fullname: user.fullName,
            email: normalizedEmail,
            phone_number: user.phoneNumber,
            status: 'Inactive',
            is_approved: false,
        });
        console.log('✓ Seller created:', seller._id);
        return seller;
    } catch (error) {
        if (error?.code === 11000 && normalizedEmail) {
            seller = await Seller.findOne({ email: normalizedEmail });
            if (seller) {
                seller.userId = userId;
                applySellerDefaultsFromUser(seller, user);
                await seller.save();
                return seller;
            }
        }
        throw error;
    }
};

export const registerSeller = async (req, res) => {
    let createdUserId = null;
    try {
        const { 
            fullName, email, password, phoneNumber, 
            storeName, businessName, address, description,
            adharNumber, gstNumber,
            bankAccountNo, ifscCode, bankHolderName
        } = req.body;

        console.log(`[Seller Register] passwordProvided=${!!password}, passwordLength=${String(password || '').length}`);
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }
        if (!password || String(password).length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        const normalizedEmail = normalizeEmail(email);
        const emailRegex = emailLookupRegex(email);

        const existingSeller = await Seller.findOne({
            $or: [
                { email: normalizedEmail },
                ...(emailRegex ? [{ email: emailRegex }] : []),
            ],
        });

        const userExists = await User.findOne({ email: emailRegex });
        const adminExists = await Admin.findOne({ email: emailRegex });

        if (adminExists) {
            return res.status(400).json({ success: false, message: 'Email is already registered with another account or role' });
        }

        if (userExists) {
            if (userExists.role === 'seller') {
                return res.status(400).json({
                    success: false,
                    message: 'This email is already registered. Please sign in instead.',
                });
            }
            return res.status(400).json({ success: false, message: 'Email is already registered with another account or role' });
        }

        if (existingSeller?.userId) {
            const linkedUser = await User.findById(existingSeller.userId);
            if (linkedUser) {
                return res.status(400).json({
                    success: false,
                    message: 'This email is already registered. Please sign in instead.',
                });
            }
        }

        const user = await User.create({
            fullName,
            email: normalizedEmail,
            password,
            phoneNumber,
            role: 'seller',
        });
        createdUserId = user._id;
        console.log(`[Seller Register] Stored password hash present=${!!user.password}, startsWith$2=${String(user.password || '').startsWith('$2')}`);

        let profile_image, adhar_document, pan_document;
        if (req.files) {
            if (req.files['profile_image']) profile_image = multerFileToUploadPath(req.files['profile_image'][0]);
            if (req.files['adhar_document']) adhar_document = multerFileToUploadPath(req.files['adhar_document'][0]);
            if (req.files['pan_document']) pan_document = multerFileToUploadPath(req.files['pan_document'][0]);
        }

        let seller;
        if (existingSeller && !existingSeller.userId) {
            console.log(`[Seller Register] Linking orphan seller ${existingSeller._id} to user ${user._id}`);
            existingSeller.userId = user._id;
            existingSeller.storeName = storeName || existingSeller.storeName;
            existingSeller.business_name = businessName || storeName || existingSeller.business_name;
            existingSeller.fullname = fullName || existingSeller.fullname;
            existingSeller.email = normalizedEmail;
            existingSeller.phone_number = phoneNumber || existingSeller.phone_number;
            if (address) existingSeller.address = address;
            if (description) existingSeller.description = description;
            if (profile_image) existingSeller.profile_image = profile_image;
            if (adharNumber) existingSeller.adhar_number = adharNumber;
            if (gstNumber) existingSeller.gst_number = gstNumber;
            if (adhar_document) existingSeller.adhar_document = adhar_document;
            if (pan_document) existingSeller.pan_document = pan_document;
            if (bankAccountNo) existingSeller.bank_account_no = bankAccountNo;
            if (ifscCode) existingSeller.ifsc_code = ifscCode;
            if (bankHolderName) existingSeller.bank_holder_name = bankHolderName;
            applySellerDefaultsFromUser(existingSeller, user);
            await existingSeller.save();
            seller = existingSeller;
        } else if (existingSeller) {
            // userId set but user missing — re-link
            existingSeller.userId = user._id;
            existingSeller.email = normalizedEmail;
            if (storeName) existingSeller.storeName = storeName;
            if (businessName || storeName) {
                existingSeller.business_name = businessName || storeName || existingSeller.business_name;
            }
            applySellerDefaultsFromUser(existingSeller, user);
            await existingSeller.save();
            seller = existingSeller;
        } else {
            seller = await Seller.create({
                userId: user._id,
                storeName,
                business_name: businessName || storeName,
                fullname: fullName,
                email: normalizedEmail,
                phone_number: phoneNumber,
                address,
                description,
                profile_image,
                adhar_number: adharNumber,
                gst_number: gstNumber,
                adhar_document,
                pan_document,
                bank_account_no: bankAccountNo,
                ifsc_code: ifscCode,
                bank_holder_name: bankHolderName,
                status: 'Inactive',
                is_approved: false,
            });
        }

        res.status(201).json({
            success: true,
            message: 'Registration successful. Waiting for admin approval.',
            data: {
                user: {
                    id: user._id,
                    fullName: user.fullName,
                    email: user.email,
                    role: user.role,
                },
                sellerId: seller._id,
                is_approved: seller.is_approved,
                status: seller.status,
            },
        });
    } catch (error) {
        if (createdUserId) {
            try {
                await User.findByIdAndDelete(createdUserId);
            } catch (_) {}
        }
        if (error?.code === 11000) {
            console.error('Register Seller duplicate key:', error.keyValue);
            return res.status(400).json({
                success: false,
                message: 'This email is already registered. Please sign in instead.',
            });
        }
        console.error('Register Seller Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const loginSeller = async (req, res) => {
    const email = req.body?.email || req.body?.identifier;
    const password = req.body?.password;
    try {
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        const user = await findSellerUserByEmail(email);

        if (!user) {
            console.log(`[Seller Login] No user for email=${normalizeEmail(email)}`);
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        if (user.isDeleted) {
            return res.status(403).json({ success: false, message: 'Your account has been deleted.' });
        }

        if (['admin', 'astrologer'].includes(user.role)) {
            console.log(`[Seller Login] Wrong role=${user.role} email=${user.email}`);
            return res.status(401).json({
                success: false,
                message: `This email is registered as ${user.role}. Use the correct app to sign in.`,
            });
        }

        const sellerRow = await Seller.findOne({ userId: user._id });
        if (user.role !== 'seller') {
            if (sellerRow) {
                user.role = 'seller';
                await user.save();
                console.log(`[Seller Login] Repaired role→seller for ${user.email}`);
            } else {
                console.log(`[Seller Login] No seller profile for role=${user.role} email=${user.email}`);
                return res.status(401).json({
                    success: false,
                    message: 'No seller account found for this email. Please register as a seller first.',
                });
            }
        }

        if (user.status === 'Blocked') {
            return res.status(403).json({ success: false, message: 'Your account has been blocked. Contact support.' });
        }

        if (!user.password) {
            console.log(`[Seller Login] Missing password hash for ${user.email}`);
            return res.status(401).json({
                success: false,
                message: 'Password not set for this account. Contact admin to reset your password.',
            });
        }

        console.log(`[Seller Login] storedPasswordHashPresent=${!!user.password}, startsWith$2=${String(user.password || '').startsWith('$2')}`);
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            console.log(`[Seller Login] Password mismatch for ${user.email}`);
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        let seller;
        try {
            seller = await getOrCreateSeller(user);
        } catch (linkErr) {
            console.error('[Seller Login] getOrCreateSeller failed:', linkErr);
            return res.status(409).json({
                success: false,
                message:
                    'Seller profile could not be linked. Contact support or try registering again with this email.',
            });
        }
        console.log(`[Seller Login] OK user=${user._id} seller=${seller?._id}`);
        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                token: generateToken(user._id),
                user: {
                    id: user._id,
                    fullName: user.fullName,
                    email: user.email,
                    role: user.role,
                    shopName: seller ? seller.storeName : 'N/A',
                    is_approved: seller ? seller.is_approved : false,
                    status: seller ? seller.status : 'Inactive'
                }
            }
        });
    } catch (error) {
        console.error('[Seller Login]', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getSellerProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const seller = await getOrCreateSeller(user);
        const adharPath = seller?.adhar_document || '';
        const panPath = seller?.pan_document || '';
        const adharRel = normalizeStoredUploadPath(adharPath);
        const panRel = normalizeStoredUploadPath(panPath);

        res.status(200).json({
            success: true,
            data: {
                fullName: user.fullName,
                email: user.email,
                phoneNumber: user.phoneNumber,
                shopName: seller ? seller.storeName : 'N/A',
                business_name: seller ? seller.business_name : '',
                description: seller ? seller.description : '',
                address: seller ? seller.address : '',
                city: seller ? seller.city : '',
                state: seller ? seller.state : '',
                pin_code: seller ? seller.pin_code : '',
                bank_account_no: seller ? seller.bank_account_no : '',
                ifsc_code: seller ? seller.ifsc_code : '',
                bank_holder_name: seller ? seller.bank_holder_name : '',
                walletBalance: seller ? seller.walletBalance : 0,
                adhar_document: adharRel,
                pan_document: panRel,
                adharDocument: adharRel,
                panDocument: panRel,
                adhar_document_url: resolvePublicMediaUrl(adharPath, req),
                pan_document_url: resolvePublicMediaUrl(panPath, req),
                adharDocumentUrl: resolvePublicMediaUrl(adharPath, req),
                panDocumentUrl: resolvePublicMediaUrl(panPath, req),
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const downloadSellerDocument = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const seller = await getOrCreateSeller(user);
        const type = String(req.params.type || '').toLowerCase();
        const field =
            type === 'aadhar' || type === 'adhar' ? 'adhar_document' : type === 'pan' ? 'pan_document' : null;

        if (!field) {
            return res.status(400).json({ success: false, message: 'Invalid document type. Use aadhar or pan.' });
        }

        const stored = seller[field];
        if (!stored) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }

        if (String(stored).startsWith('http')) {
            return res.redirect(stored);
        }

        const filePath = resolveLocalUploadFile(stored);
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'Document file missing on server' });
        }

        const filename = path.basename(filePath);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.sendFile(path.resolve(filePath));
    } catch (error) {
        console.error('Download seller document error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateSellerProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const seller = await getOrCreateSeller(user);

        const {
            fullName,
            fullname,
            email,
            phone_number,
            phoneNumber,
            business_name,
            shopName,
            storeName,
            address,
            city,
            state,
            pin_code,
            description,
            bank_account_no,
            ifsc_code,
            bank_holder_name,
        } = req.body;

        if (fullName || fullname) user.fullName = fullName || fullname;
        if (email) user.email = String(email).toLowerCase();
        if (phone_number || phoneNumber) user.phoneNumber = phone_number || phoneNumber;
        await user.save();

        if (business_name || shopName || storeName) {
            seller.business_name = business_name || shopName || storeName;
            seller.storeName = shopName || storeName || seller.storeName;
        }
        if (fullname || fullName) seller.fullname = fullname || fullName;
        if (address !== undefined) seller.address = address;
        if (city !== undefined) seller.city = city;
        if (state !== undefined) seller.state = state;
        if (pin_code !== undefined) seller.pin_code = pin_code;
        if (description !== undefined) seller.description = description;
        if (bank_account_no !== undefined) seller.bank_account_no = bank_account_no;
        if (ifsc_code !== undefined) seller.ifsc_code = ifsc_code;
        if (bank_holder_name !== undefined) seller.bank_holder_name = bank_holder_name;
        await seller.save();

        return res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                fullName: user.fullName,
                email: user.email,
                phoneNumber: user.phoneNumber,
                shopName: seller.storeName,
                business_name: seller.business_name,
                address: seller.address,
                city: seller.city,
                state: seller.state,
                pin_code: seller.pin_code,
                walletBalance: seller.walletBalance,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getSellerDashboardStats = async (req, res) => {
    try {
        const seller = await getOrCreateSeller(req.user);

        const productCount = await Product.countDocuments({ seller_id: seller._id });
        
        const sellerProducts = await Product.find({ seller_id: seller._id }).select('_id');
        const productIds = sellerProducts.map(p => p._id);
        
        const orders = await Order.find({ 'items.productId': { $in: productIds } });
        
        let totalRevenue = 0;
        let pendingDeliveries = 0;
        
        orders.forEach(order => {
            order.items.forEach(item => {
                if (productIds.some(id => id.equals(item.productId))) {
                    totalRevenue += item.price * item.quantity;
                }
            });
            if (['pending', 'processing', 'shipped'].includes(order.status)) {
                pendingDeliveries++;
            }
        });

        res.status(200).json({
            success: true,
            data: {
                totalOrders: orders.length,
                activeListings: productCount,
                totalRevenue: totalRevenue,
                pendingDeliveries: pendingDeliveries
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getSellerProducts = async (req, res) => {
    try {
        const seller = await getOrCreateSeller(req.user);

        const products = await Product.find({ seller_id: seller._id });
        res.status(200).json({ success: true, data: products.map(formatProduct) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const addSellerProduct = async (req, res) => {
    try {
        const seller = await getOrCreateSeller(req.user);

        const { product_name, description, base_price, selling_price, stock } = req.body;
        
        // ✓ VALIDATION: Check required fields
        if (!product_name || !product_name.trim()) {
            return res.status(400).json({ 
                success: false, 
                message: 'Product name is required' 
            });
        }
        
        if (!selling_price) {
            return res.status(400).json({ 
                success: false, 
                message: 'Selling price is required' 
            });
        }
        
        if (!stock && stock !== 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Stock quantity is required' 
            });
        }

        // ✓ VALIDATION: Parse numeric values
        const parsedBasePrice = base_price ? parseFloat(base_price) : 0;
        const parsedSellingPrice = parseFloat(selling_price);
        const parsedStock = parseInt(stock, 10);

        if (isNaN(parsedSellingPrice) || parsedSellingPrice <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Selling price must be a positive number' 
            });
        }

        if (isNaN(parsedStock) || parsedStock < 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Stock must be a non-negative number' 
            });
        }
        
        let product_images = [];
        if (req.files) {
            product_images = req.files.map(file => `/uploads/${file.filename}`);
        } else if (req.file) {
            product_images = [`/uploads/${req.file.filename}`];
        }

        console.log('✓ Creating product for seller:', seller._id, {
            product_name: product_name.trim(),
            selling_price: parsedSellingPrice,
            stock: parsedStock,
            images: product_images.length
        });

        const newProduct = await Product.create({
            product_name: product_name.trim(),
            description: description?.trim() || '',
            base_price: parsedBasePrice,
            selling_price: parsedSellingPrice,
            stock: parsedStock,
            product_images,
            seller_id: seller._id
        });

        console.log('✓ Product created successfully:', newProduct._id);

        res.status(201).json({
            success: true,
            message: 'Product added successfully',
            data: formatProduct(newProduct)
        });
    } catch (error) {
        console.error('✗ Error adding product:', error.message);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to create product' 
        });
    }
};

export const updateSellerProduct = async (req, res) => {
    try {
        const seller = await getOrCreateSeller(req.user);

        const { id } = req.params;
        const product = await Product.findOne({ _id: id, seller_id: seller._id });
        
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found or unauthorized' });
        }

        const { product_name, description, base_price, selling_price, stock } = req.body;
        
        // ✓ VALIDATION: Only update if provided
        if (product_name && product_name.trim()) {
            product.product_name = product_name.trim();
        }
        
        if (description) {
            product.description = description.trim();
        }

        // ✓ VALIDATION: Parse numeric values if provided
        if (base_price) {
            const parsedPrice = parseFloat(base_price);
            if (isNaN(parsedPrice)) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Base price must be a valid number' 
                });
            }
            product.base_price = parsedPrice;
        }

        if (selling_price) {
            const parsedPrice = parseFloat(selling_price);
            if (isNaN(parsedPrice) || parsedPrice <= 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Selling price must be a positive number' 
                });
            }
            product.selling_price = parsedPrice;
        }

        if (stock !== undefined && stock !== null) {
            const parsedStock = parseInt(stock, 10);
            if (isNaN(parsedStock) || parsedStock < 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Stock must be a non-negative number' 
                });
            }
            product.stock = parsedStock;
        }

        if (req.files && req.files.length > 0) {
            product.product_images = req.files.map(file => `/uploads/${file.filename}`);
        }

        await product.save();

        console.log('✓ Product updated successfully:', product._id);

        res.status(200).json({
            success: true,
            message: 'Product updated successfully',
            data: formatProduct(product)
        });
    } catch (error) {
        console.error('✗ Error updating product:', error.message);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to update product' 
        });
    }
};

export const deleteSellerProduct = async (req, res) => {
    try {
        const seller = await getOrCreateSeller(req.user);

        const { id } = req.params;
        const product = await Product.findOneAndDelete({ _id: id, seller_id: seller._id });
        
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found or unauthorized' });
        }

        res.status(200).json({
            success: true,
            message: 'Product deleted successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getSellerOrders = async (req, res) => {
    try {
        const seller = await getOrCreateSeller(req.user);

        const sellerProducts = await Product.find({ seller_id: seller._id }).select('_id');
        const productIds = sellerProducts.map(p => p._id);
        
        const orders = await Order.find({ 'items.productId': { $in: productIds } })
            .populate('userId', 'fullName phoneNumber')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, data: orders });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateSellerOrderStatus = async (req, res) => {
    try {
        const seller = await getOrCreateSeller(req.user);

        const { id } = req.params;
        const { status } = req.body;

        const order = await Order.findById(id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        const sellerProducts = await Product.find({ seller_id: seller._id }).select('_id');
        const productIds = sellerProducts.map(p => p._id.toString());

        const hasSellerProduct = order.items.some(item => 
            item.productId && productIds.includes(item.productId.toString())
        );

        if (!hasSellerProduct) {
            return res.status(403).json({ success: false, message: 'Unauthorized to update this order' });
        }

        order.status = status;
        if (status === 'delivered' && order.paymentMethod === 'cod') {
            order.paymentStatus = 'paid';
        }
        await order.save();

        await broadcastOrderStatusChange(order, { notifyUser: true, creditEarnings: true });

        res.status(200).json({ success: true, message: `Order status updated to ${status}`, data: order });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /seller/payouts
 * Withdrawal requests raised by the seller
 */
/**
 * Legacy Flutter path: GET /seller/wallet
 * Returns wallet balance + withdrawal history in one payload.
 */
export const getSellerWallet = async (req, res) => {
    try {
        const seller = await getOrCreateSeller(req.user);

        const payouts = await Transaction.find({
            sellerId: seller._id,
            type: 'debit',
            referenceType: 'Withdrawal',
        }).sort({ createdAt: -1 });

        const [totalEarnedAgg, totalWithdrawnAgg, pendingAgg] = await Promise.all([
            Transaction.aggregate([
                { $match: { sellerId: seller._id, type: 'credit', referenceType: 'Order', status: 'completed' } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]),
            Transaction.aggregate([
                { $match: { sellerId: seller._id, type: 'debit', referenceType: 'Withdrawal', status: 'paid' } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]),
            Transaction.aggregate([
                { $match: { sellerId: seller._id, type: 'debit', referenceType: 'Withdrawal', status: { $in: ['pending', 'processing'] } } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]),
        ]);

        const balance = seller.walletBalance || 0;
        res.status(200).json({
            success: true,
            data: {
                balance,
                withdrawableBalance: balance,
                walletBalance: balance,
                totalEarned: totalEarnedAgg[0]?.total || 0,
                totalWithdrawn: totalWithdrawnAgg[0]?.total || 0,
                pendingWithdrawal: pendingAgg[0]?.total || 0,
                withdrawals: payouts,
                transactions: payouts,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getSellerPayouts = async (req, res) => {
    try {
        const seller = await getOrCreateSeller(req.user);

        const payouts = await Transaction.find({
            sellerId: seller._id,
            type: 'debit',
            referenceType: 'Withdrawal',
        }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: payouts });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /seller/payouts/stats
 */
export const getSellerPayoutStats = async (req, res) => {
    try {
        const seller = await getOrCreateSeller(req.user);

        const [totalEarnedAgg, totalWithdrawnAgg, pendingAgg] = await Promise.all([
            Transaction.aggregate([
                { $match: { sellerId: seller._id, type: 'credit', referenceType: 'Order', status: 'completed' } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]),
            Transaction.aggregate([
                { $match: { sellerId: seller._id, type: 'debit', referenceType: 'Withdrawal', status: 'paid' } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]),
            Transaction.aggregate([
                { $match: { sellerId: seller._id, type: 'debit', referenceType: 'Withdrawal', status: { $in: ['pending', 'processing'] } } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]),
        ]);

        res.status(200).json({
            success: true,
            data: {
                walletBalance: seller.walletBalance || 0,
                totalEarned: totalEarnedAgg[0]?.total || 0,
                totalWithdrawn: totalWithdrawnAgg[0]?.total || 0,
                pendingWithdrawal: pendingAgg[0]?.total || 0,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * POST /seller/payouts/request
 * Seller requests withdrawal; admin approves via /admin/payouts/:id/status
 */
export const requestSellerPayout = async (req, res) => {
    try {
        const seller = await getOrCreateSeller(req.user);
        const amount = Number(req.body.amount);

        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Enter a valid amount' });
        }

        if ((seller.walletBalance || 0) < amount) {
            return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
        }

        if (!seller.bank_account_no || !seller.ifsc_code) {
            return res.status(400).json({
                success: false,
                message: 'Add bank account details in your profile before requesting a payout',
            });
        }

        seller.walletBalance -= amount;
        await seller.save();

        const txn = await Transaction.create({
            sellerId: seller._id,
            amount,
            type: 'debit',
            status: 'pending',
            description: req.body.description || 'Withdrawal request',
            referenceType: 'Withdrawal',
        });

        await createNotification({
            userId: req.user._id,
            title: 'Payout requested',
            body: `Your withdrawal request of ₹${amount} is pending admin approval.`,
            type: 'payout',
        });

        res.status(201).json({
            success: true,
            message: 'Withdrawal request submitted. Admin will process it shortly.',
            data: txn,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /seller/reviews
 * Get reviews for the authenticated seller's products
 */
export const getSellerReviews = async (req, res) => {
    try {
        const seller = await getOrCreateSeller(req.user);

        const reviews = await Review.find({ sellerId: seller._id })
            .populate('userId', 'fullName')
            .populate('productId', 'product_name')
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: reviews });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
/**
 * GET /seller/notifications
 */
export const getSellerNotifications = async (req, res) => {
    try {
        const userId = req.user._id ?? req.user.id;
        const notifications = await Notification.find({ userId })
            .sort({ createdAt: -1 });
        const unreadCount = await Notification.countDocuments({ userId, isRead: false });
        res.status(200).json({
            success: true,
            data: { notifications, unreadCount },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * POST /seller/notifications/:id/read
 */
export const markSellerNotificationRead = async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id ?? req.user.id },
            { isRead: true },
            { returnDocument: 'after' }
        );
        res.status(200).json({ success: true, data: notification });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * POST /seller/notifications/read-all
 */
export const markAllSellerNotificationsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { userId: req.user._id ?? req.user.id, isRead: false },
            { isRead: true }
        );
        res.status(200).json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
