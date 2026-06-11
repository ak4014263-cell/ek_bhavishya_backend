import mongoose from 'mongoose';
import Remedy from '../models/Remedy.js';
import Product from '../models/Product.js';
import Course from '../models/Course.js';
import LiveSession from '../models/LiveSession.js';
import AdminCourse from '../modules/admin/models/adminCourse.model.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';
import PoojaBooking from '../models/PoojaBooking.js';
import Astrologer from '../models/Astrologer.js';
import Seller from '../models/Seller.js';
import Order from '../models/Order.js';
import { createNotification } from '../utils/notificationService.js';
import { getIO } from '../socket/socketManager.js';
import { sendCODConfirmation } from '../services/codConfirmationService.js';
import { calculateEstimatedDelivery } from '../services/orderTrackingService.js';
import { creditSellersForOrder } from '../utils/sellerEarnings.js';
import { notifySellersNewOrder, broadcastOrderStatusChange } from '../utils/orderEvents.js';
import path from 'path';
import fs from 'fs';
import { resolveAstrologerForUser, normalizeMediaPath } from '../utils/astrologerLink.js';
import {
    userIsEnrolledInCourse,
    stripModulesForPreview,
    normalizeModulesForEnrolled,
    collectCourseUploadPaths,
} from '../utils/courseAccess.js';

import Category from '../models/Category.js';

const resolveMediaUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    const base = process.env.APP_BASE_URL || process.env.CLIENT_URL || 'http://localhost:5001';
    return `${base.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
};

// --- Remedy Controllers ---
const normalizeRemedyForClient = (remedy) => {
    if (!remedy) return remedy;
    const obj = remedy.toObject ? remedy.toObject() : { ...remedy };
    if (obj.image) {
        obj.image = normalizeMediaPath(obj.image) || obj.image;
    }
    return obj;
};

export const createRemedy = async (req, res) => {
    try {
        const { title, description, base_price, category, type, videoUrl, hasLivePooja, livePoojaLink, livePoojaTime } = req.body;
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer profile not found' });

        let image = req.body.image;
        if (req.file) {
            image = normalizeMediaPath(`/uploads/${req.file.filename}`) || `/uploads/${req.file.filename}`;
        }

        const remedy = await Remedy.create({
            title,
            description,
            base_price,
            type: type || category,
            image,
            videoUrl,
            hasLivePooja: hasLivePooja === true || hasLivePooja === 'true',
            livePoojaLink,
            livePoojaTime,
            astrologerId: astrologer._id
        });

        res.status(201).json({ success: true, data: normalizeRemedyForClient(remedy) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getMyRemedies = async (req, res) => {
    try {
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) {
            return res.status(200).json({ success: true, data: [], message: 'Astrologer profile not linked yet' });
        }

        const remedies = await Remedy.find({ astrologerId: astrologer._id }).sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            data: remedies.map((r) => normalizeRemedyForClient(r)),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getMyRemedyById = async (req, res) => {
    try {
        const { remedyId } = req.params;
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer profile not found' });

        const remedy = await Remedy.findOne({ _id: remedyId, astrologerId: astrologer._id });
        if (!remedy) {
            return res.status(404).json({ success: false, message: 'Remedy not found or unauthorized' });
        }

        res.status(200).json({ success: true, data: normalizeRemedyForClient(remedy) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateRemedy = async (req, res) => {
    try {
        const { remedyId } = req.params;
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer profile not found' });

        const remedy = await Remedy.findOne({ _id: remedyId, astrologerId: astrologer._id });
        if (!remedy) {
            return res.status(404).json({ success: false, message: 'Remedy not found or unauthorized' });
        }

        const {
            title,
            description,
            base_price,
            category,
            type,
            videoUrl,
            hasLivePooja,
            livePoojaLink,
            livePoojaTime,
            image,
        } = req.body;

        if (title !== undefined) remedy.title = title;
        if (description !== undefined) remedy.description = description;
        if (base_price !== undefined) remedy.base_price = Number(base_price);
        if (category !== undefined || type !== undefined) remedy.type = type || category;
        if (videoUrl !== undefined) remedy.videoUrl = videoUrl;
        if (hasLivePooja !== undefined) {
            remedy.hasLivePooja = hasLivePooja === true || hasLivePooja === 'true';
        }
        if (livePoojaLink !== undefined) remedy.livePoojaLink = livePoojaLink;
        if (livePoojaTime !== undefined) remedy.livePoojaTime = livePoojaTime;
        if (req.file) {
            remedy.image = normalizeMediaPath(`/uploads/${req.file.filename}`) || `/uploads/${req.file.filename}`;
        } else if (image !== undefined && image !== '') {
            remedy.image = image;
        }

        await remedy.save();
        res.status(200).json({ success: true, data: normalizeRemedyForClient(remedy) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteRemedy = async (req, res) => {
    try {
        const { remedyId } = req.params;
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer profile not found' });

        const remedy = await Remedy.findOneAndDelete({ _id: remedyId, astrologerId: astrologer._id });
        if (!remedy) {
            return res.status(404).json({ success: false, message: 'Remedy not found or unauthorized' });
        }

        res.status(200).json({ success: true, message: 'Remedy deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- Store/Product Controllers ---
export const getRemedies = async (req, res) => {
    try {
        const filter = { status: 'Published' };
        if (req.query.astrologerId) {
            filter.astrologerId = req.query.astrologerId;
        }
        let remedies = await Remedy.find(filter).populate('astrologerId', 'personalDetails.name');
        
        // Fallback for demo if empty
        if (remedies.length === 0) {
            remedies = [
                {
                    _id: 'remedy_1',
                    title: 'Sun Planetary Remedy',
                    description: 'Strengthen your Sun with this Vedic ritual.',
                    base_price: 501,
                    type: 'planetary',
                    image: 'https://picsum.photos/400/300?sig=1'
                },
                {
                    _id: 'remedy_2',
                    title: 'Wealth Prosperity Pooja',
                    description: 'Attract abundance and financial stability.',
                    base_price: 1100,
                    type: 'general',
                    image: 'https://picsum.photos/400/300?sig=2'
                }
            ];
        }
        
        res.status(200).json({ success: true, data: remedies });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getRemedyById = async (req, res) => {
    try {
        const { remedyId } = req.params;
        let remedy;
        
        // Handle demo ID
        if (!remedyId.match(/^[0-9a-fA-F]{24}$/)) {
            remedy = {
                _id: remedyId,
                title: 'Sacred Remedy (Demo)',
                description: 'Strengthen your planetary influences with this Vedic ritual.',
                base_price: 501,
                type: 'general',
                one_to_one: {
                    available_slots: [
                        { date: new Date().toISOString(), time_slots: [{ start_time: "10:00 AM", end_time: "11:00 AM" }, { start_time: "02:00 PM", end_time: "03:00 PM" }] }
                    ]
                }
            };
        } else {
            remedy = await Remedy.findById(remedyId).populate('astrologerId', 'personalDetails.name');
            if (!remedy) return res.status(404).json({ success: false, message: 'Remedy not found' });
            // Only return published remedies to public endpoints
            if (remedy.status !== 'Published') return res.status(404).json({ success: false, message: 'Remedy not found' });
        }
        
        res.status(200).json({ success: true, remedy });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const bookRemedy = async (req, res) => {
    try {
        const { remedyId } = req.params;
        const userId = req.user._id;

        // Handle demo/fallback remedies that have non-MongoDB IDs
        const isDemoItem = !remedyId.match(/^[0-9a-fA-F]{24}$/);
        
        let remedy = null;
        let remedyTitle = 'Remedy';
        let remedyPrice = 0;

        if (isDemoItem) {
            // Demo item — use reasonable defaults
            remedyTitle = 'Sacred Remedy (Demo)';
            remedyPrice = 501;
        } else {
            remedy = await Remedy.findById(remedyId);
            if (!remedy) return res.status(404).json({ success: false, message: 'Remedy not found' });
            remedyTitle = remedy.title;
            remedyPrice = remedy.base_price;
        }

        const { paymentMethod } = req.body;
        const user = await User.findById(userId);

        if (paymentMethod !== 'razorpay') {
            if (user.walletBalance < remedyPrice) {
                return res.status(400).json({ success: false, message: 'Insufficient balance' });
            }
            // Deduct balance
            user.walletBalance -= remedyPrice;
            await user.save();
        }

        // Create transaction
        await Transaction.create({
            userId,
            amount: remedyPrice,
            type: 'debit',
            description: `Booked Remedy: ${remedyTitle}`,
            referenceType: 'Remedy'
        });

        // Create Order
        const remedyOrder = await Order.create({
            userId,
            items: [{
                remedyId: isDemoItem ? undefined : remedyId,
                name: remedyTitle,
                price: remedyPrice,
                quantity: 1,
                itemType: 'Remedy'
            }],
            totalAmount: remedyPrice,
            paymentStatus: paymentMethod === 'razorpay' ? 'pending' : 'paid',
            paymentMethod: paymentMethod || 'wallet',
            status: paymentMethod === 'cod' ? 'pending' : 'processing'
        });

        // Emit real-time event to user about order creation
        try {
            const io = getIO();
            if (io) {
                io.to(`user_${userId}`).emit('order_created', {
                    orderId: remedyOrder._id,
                    items: remedyOrder.items,
                    totalAmount: remedyOrder.totalAmount,
                    paymentStatus: remedyOrder.paymentStatus,
                    status: remedyOrder.status,
                    timestamp: remedyOrder.createdAt
                });
            }
        } catch (socketErr) {
            console.error('Failed to emit order_created via socket:', socketErr.message);
        }

        // Notify user
        await createNotification({
            userId,
            title: 'Remedy Booked',
            body: `You have successfully booked the remedy: ${remedyTitle}`,
            type: 'general'
        });

        res.status(200).json({ success: true, message: 'Remedy booked successfully', balance: user.walletBalance });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- Store/Product Controllers ---
export const getProducts = async (req, res) => {
    try {
        let products = await Product.find()
            .populate('seller_id', 'business_name')
            .populate('category_id', 'name');
        
        // Fallback for demo if empty
        if (products.length === 0) {
            products = [
                {
                    _id: 'prod_1',
                    product_name: 'Natural Blue Sapphire',
                    description: 'A premium quality Neelam stone for Saturn strength.',
                    base_price: 4500,
                    selling_price: 4999,
                    product_images: ['https://picsum.photos/400/300?sig=3'],
                    stock: 10,
                    category: 'Planets'
                },
                {
                    _id: 'prod_2',
                    product_name: 'Silver Gemstone Ring',
                    description: 'Beautifully crafted ring for your lucky stone.',
                    base_price: 1200,
                    selling_price: 1500,
                    product_images: ['https://picsum.photos/400/300?sig=4'],
                    stock: 25,
                    category: 'Rings'
                }
            ];
        }
        
        const mapped = products.map(p => {
            const plain = p.toObject ? p.toObject() : p;
            const images = (plain.product_images || []).map(img => resolveMediaUrl(img));
            return {
                ...plain,
                product_images: images,
                imageUrl: images[0] || null,
            };
        });

        res.status(200).json({ success: true, data: mapped });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const purchaseProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        const userId = req.user._id;

        // Handle demo/fallback products with non-MongoDB IDs
        const isDemoItem = !productId.match(/^[0-9a-fA-F]{24}$/);

        let product = null;
        let productName = 'Product';
        let productPrice = 0;

        if (isDemoItem) {
            productName = 'Gemstone (Demo)';
            productPrice = 4999;
        } else {
            product = await Product.findById(productId);
            if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
            if (product.stock <= 0) return res.status(400).json({ success: false, message: 'Product out of stock' });
            productName = product.product_name;
            productPrice = product.selling_price;
        }

        const { paymentMethod } = req.body;
        const user = await User.findById(userId);
        
        if (paymentMethod !== 'razorpay') {
            if (user.walletBalance < productPrice) {
                return res.status(400).json({ success: false, message: 'Insufficient balance' });
            }
            // Deduct balance
            user.walletBalance -= productPrice;
            await user.save();
        }

        if (product) {
            product.stock -= 1;
            await product.save();
        }

        // Create transaction
        await Transaction.create({
            userId,
            amount: productPrice,
            type: 'debit',
            description: `Purchased Product: ${productName}`,
            referenceType: 'Product'
        });

        // Create Order
        let finalShippingAddress = undefined;
        const reqAddress = req.body.shippingAddress;
        if (reqAddress) {
            finalShippingAddress = {
                fullName: reqAddress.fullName,
                phone: reqAddress.phone || reqAddress.phoneNumber,
                address: reqAddress.address || reqAddress.addressLine1,
                addressLine1: reqAddress.addressLine1,
                addressLine2: reqAddress.addressLine2,
                city: reqAddress.city,
                state: reqAddress.state,
                pincode: reqAddress.pincode
            };
        } else {
            finalShippingAddress = user.addresses?.find(a => a.isDefault) || (user.addresses?.length > 0 ? user.addresses[0] : undefined);
        }

        const productOrder = await Order.create({
            userId,
            items: [{
                productId: isDemoItem ? undefined : productId,
                name: productName,
                price: productPrice,
                quantity: 1,
                itemType: 'Product'
            }],
            totalAmount: productPrice,
            paymentStatus: paymentMethod === 'razorpay' || paymentMethod === 'cod' ? 'pending' : 'paid',
            paymentMethod: paymentMethod || 'wallet',
            status: paymentMethod === 'cod' ? 'pending' : 'processing',
            shippingAddress: finalShippingAddress
        });

        // Emit real-time event to user about order creation
        try {
            const io = getIO();
            if (io) {
                io.to(`user_${userId}`).emit('order_created', {
                    orderId: productOrder._id,
                    items: productOrder.items,
                    totalAmount: productOrder.totalAmount,
                    paymentStatus: productOrder.paymentStatus,
                    status: productOrder.status,
                    timestamp: productOrder.createdAt
                });
            }
        } catch (socketErr) {
            console.error('Failed to emit order_created via socket:', socketErr.message);
        }

        // Notify user
        await createNotification({
            userId,
            title: 'Purchase Successful',
            body: `You have successfully purchased ${productName}`,
            type: 'general'
        });

        await notifySellersNewOrder(productOrder);
        if (productOrder.paymentStatus === 'paid') {
            await creditSellersForOrder(productOrder);
        }

        res.status(200).json({ success: true, message: 'Product purchased successfully', balance: user.walletBalance });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- Course Controllers ---
export const getCourses = async (req, res) => {
    try {
        // Fetch astrologer courses (Published) with populated instructor info
        const [astrologerCourses, adminCourses] = await Promise.all([
            Course.find({ status: 'Published' })
                .populate({
                    path: 'astrologerId',
                    select: 'personalDetails',
                })
                .lean(),
            AdminCourse.find({ status: 'Approved' }).lean()
        ]);

        // Resolve instructor names for astrologer courses
        const mappedAstrologer = astrologerCourses.map(c => {
            const personalName = c.astrologerId?.personalDetails?.name;
            const pseudonym = c.astrologerId?.personalDetails?.pseudonym;
            const resolvedName = personalName || pseudonym || c.instructor || 'Astrologer';
            const moduleCount = (c.modules || []).length;
            const { modules: _m, ...rest } = c;
            return {
                ...rest,
                instructor: resolvedName,
                source: 'astrologer',
                moduleCount,
                modules: [],
            };
        });

        // Map admin courses
        const mappedAdmin = adminCourses.map(c => {
            const moduleCount = (c.modules || []).length;
            const { modules: _m, ...rest } = c;
            return { ...rest, source: 'admin', moduleCount, modules: [] };
        });

        const combined = [...mappedAdmin, ...mappedAstrologer];
        combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.status(200).json({ success: true, data: combined });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getCourseModules = async (req, res) => {
    try {
        const { courseId } = req.params;
        let course = await AdminCourse.findById(courseId).select('title modules').lean();
        if (!course) {
            course = await Course.findById(courseId).select('title modules').lean();
        }
        if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

        const enrolled = req.user
            ? await userIsEnrolledInCourse(req.user._id, courseId)
            : false;

        if (!enrolled) {
            return res.status(200).json({
                success: true,
                enrolled: false,
                message: 'Enroll in this course to access lessons and downloads',
                data: stripModulesForPreview(course.modules || []),
            });
        }

        res.status(200).json({
            success: true,
            enrolled: true,
            data: normalizeModulesForEnrolled(course.modules || [], courseId),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** Stream uploaded lesson files only for enrolled users */
export const getCourseContentAsset = async (req, res) => {
    try {
        const { courseId } = req.params;
        const filePath = (req.query.path || '').toString().trim();

        if (!filePath || !filePath.startsWith('/uploads/')) {
            return res.status(400).json({ success: false, message: 'Invalid file path' });
        }

        const enrolled = await userIsEnrolledInCourse(req.user._id, courseId);
        if (!enrolled) {
            return res.status(403).json({
                success: false,
                message: 'Purchase this course to access lesson files',
            });
        }

        let course = await Course.findById(courseId).select('modules').lean();
        if (!course) {
            course = await AdminCourse.findById(courseId).select('modules').lean();
        }
        if (!course) {
            return res.status(404).json({ success: false, message: 'Course not found' });
        }

        const allowed = collectCourseUploadPaths(course.modules || []);
        const normalized = normalizeMediaPath(filePath);
        if (!allowed.has(normalized) && !allowed.has(filePath)) {
            return res.status(403).json({ success: false, message: 'File not linked to this course' });
        }

        const diskPath = path.join(process.cwd(), normalized.replace(/^\//, ''));
        if (!fs.existsSync(diskPath)) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        return res.sendFile(diskPath);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const addCourse = async (req, res) => {
    try {
        const { title, description, price, duration, thumbnail, category, status, publish } = req.body;
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer profile not found' });

        let courseThumb = thumbnail;
        if (req.file) {
            courseThumb = `/uploads/${req.file.filename}`;
        }

        const publishNow =
            publish === true ||
            publish === 'true' ||
            status === 'Published' ||
            (status !== 'Draft' && publish !== false && publish !== 'false');

        const course = await Course.create({
            title,
            description,
            price,
            duration,
            category: category || 'General',
            thumbnail: normalizeMediaPath(courseThumb),
            astrologerId: astrologer._id,
            instructor: astrologer.personalDetails?.name || 'Astrologer',
            status: publishNow ? 'Published' : 'Draft',
        });

        res.status(201).json({ success: true, data: course });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getMyCourses = async (req, res) => {
    try {
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) {
            return res.status(200).json({ success: true, courses: [], message: 'Astrologer profile not linked yet' });
        }

        const courses = await Course.find({ astrologerId: astrologer._id }).sort({ createdAt: -1 }).lean();
        const activeLives = await LiveSession.find({
            astrologerId: astrologer._id,
            status: 'active',
            courseId: { $ne: null },
        })
            .select('_id courseId title startTime currentViewersCount')
            .lean();
        const liveByCourse = Object.fromEntries(
            activeLives.map((s) => [s.courseId.toString(), s])
        );
        const normalized = courses.map((c) => ({
            ...c,
            thumbnail: normalizeMediaPath(c.thumbnail),
            liveMasterclass: liveByCourse[c._id.toString()] || null,
            isLiveNow: !!liveByCourse[c._id.toString()],
        }));
        res.status(200).json({ success: true, courses: normalized });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getMyCourseById = async (req, res) => {
    try {
        const { courseId } = req.params;
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer profile not found' });
        }

        const course = await Course.findOne({ _id: courseId, astrologerId: astrologer._id }).lean();
        if (!course) {
            return res.status(404).json({ success: false, message: 'Course not found or unauthorized' });
        }

        course.thumbnail = normalizeMediaPath(course.thumbnail);
        const liveSession = await LiveSession.findOne({
            courseId: course._id,
            status: 'active',
        })
            .select('_id title startTime currentViewersCount sessionType')
            .lean();
        course.liveMasterclass = liveSession;
        course.isLiveNow = !!liveSession;
        res.status(200).json({ success: true, data: course });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteCourse = async (req, res) => {
    try {
        const { courseId } = req.params;
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer profile not found' });
        
        const course = await Course.findOneAndDelete({ _id: courseId, astrologerId: astrologer._id });
        if (!course) return res.status(404).json({ success: false, message: 'Course not found or unauthorized' });

        res.status(200).json({ success: true, message: 'Course deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const publishRemedy = async (req, res) => {
    try {
        const { remedyId } = req.params;
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer profile not found' });

        const remedy = await Remedy.findOneAndUpdate(
            { _id: remedyId, astrologerId: astrologer._id },
            { status: 'Published' },
            { new: true }
        );
        if (!remedy) return res.status(404).json({ success: false, message: 'Remedy not found or unauthorized' });

        res.status(200).json({ success: true, message: 'Remedy published successfully', data: remedy });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const unpublishRemedy = async (req, res) => {
    try {
        const { remedyId } = req.params;
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer profile not found' });

        const remedy = await Remedy.findOneAndUpdate(
            { _id: remedyId, astrologerId: astrologer._id },
            { status: 'Draft' },
            { new: true }
        );
        if (!remedy) return res.status(404).json({ success: false, message: 'Remedy not found or unauthorized' });

        res.status(200).json({ success: true, message: 'Remedy unpublished successfully', data: remedy });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const publishCourse = async (req, res) => {
    try {
        const { courseId } = req.params;
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer profile not found' });

        const course = await Course.findOneAndUpdate(
            { _id: courseId, astrologerId: astrologer._id },
            { status: 'Published' },
            { new: true }
        );
        if (!course) return res.status(404).json({ success: false, message: 'Course not found or unauthorized' });

        res.status(200).json({ success: true, message: 'Course published successfully', data: course });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const unpublishCourse = async (req, res) => {
    try {
        const { courseId } = req.params;
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer profile not found' });

        const course = await Course.findOneAndUpdate(
            { _id: courseId, astrologerId: astrologer._id },
            { status: 'Draft' },
            { new: true }
        );
        if (!course) return res.status(404).json({ success: false, message: 'Course not found or unauthorized' });

        res.status(200).json({ success: true, message: 'Course unpublished successfully', data: course });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const addCourseModule = async (req, res) => {
    try {
        const { courseId } = req.params;
        const { title, description } = req.body;
        
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer profile not found' });

        const course = await Course.findOne({ _id: courseId, astrologerId: astrologer._id });
        if (!course) return res.status(404).json({ success: false, message: 'Course not found or unauthorized' });

        const newModule = { title, description, videos: [], documents: [], images: [], order: course.modules.length };
        course.modules.push(newModule);
        await course.save();

        res.status(201).json({ success: true, message: 'Module added successfully', data: course });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const addModuleContent = async (req, res) => {
    try {
        const { courseId, moduleId } = req.params;
        const { contentType, title, url, duration, fileType } = req.body; // contentType: 'videos' | 'documents' | 'images'
        
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer profile not found' });

        const course = await Course.findOne({ _id: courseId, astrologerId: astrologer._id });
        if (!course) return res.status(404).json({ success: false, message: 'Course not found or unauthorized' });

        const module = course.modules.id(moduleId);
        if (!module) return res.status(404).json({ success: false, message: 'Module not found' });

        if (!title?.trim()) {
            return res.status(400).json({ success: false, message: 'Title is required' });
        }

        let contentUrl = (url || '').trim();
        let resolvedFileType = fileType;

        if (req.file) {
            contentUrl = normalizeMediaPath(`/uploads/${req.file.filename}`);
            const ext = req.file.originalname?.includes('.')
                ? req.file.originalname.split('.').pop().toLowerCase()
                : '';
            if (ext) resolvedFileType = ext;
        }

        if (!contentUrl) {
            return res.status(400).json({ success: false, message: 'Upload a file or provide a URL' });
        }

        const parsedDuration =
            duration !== undefined && duration !== '' && duration !== null
                ? parseInt(duration, 10)
                : undefined;

        if (contentType === 'videos') {
            module.videos.push({
                title: title.trim(),
                url: contentUrl,
                duration: Number.isNaN(parsedDuration) ? undefined : parsedDuration,
            });
        } else if (contentType === 'documents') {
            module.documents.push({
                title: title.trim(),
                url: contentUrl,
                fileType: resolvedFileType || 'file',
            });
        } else if (contentType === 'images') {
            module.images.push({ title: title.trim(), url: contentUrl });
        } else {
            return res.status(400).json({ success: false, message: 'Invalid content type' });
        }

        await course.save();

        res.status(200).json({ success: true, message: 'Content added to module', data: course });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const enrollInCourse = async (req, res) => {
    try {
        const { courseId } = req.params;
        const userId = req.user._id;

        let course = await Course.findById(courseId);
        if (!course) {
            course = await AdminCourse.findById(courseId);
        }
        if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const courseIdStr = course._id.toString();
        const onProfile = (user.enrolledCourses || []).some(
            (id) => id && id.toString() === courseIdStr
        );
        if (onProfile) {
            return res.status(400).json({
                success: false,
                alreadyEnrolled: true,
                message: 'You are already enrolled in this course',
            });
        }

        const alreadyEnrolled = await Order.findOne({
            userId,
            status: { $nin: ['cancelled'] },
            items: {
                $elemMatch: {
                    itemType: 'Course',
                    courseId: course._id,
                },
            },
        });
        if (alreadyEnrolled) {
            await User.findByIdAndUpdate(userId, {
                $addToSet: { enrolledCourses: course._id },
            });
            return res.status(400).json({
                success: false,
                alreadyEnrolled: true,
                message: 'You are already enrolled in this course',
            });
        }

        const { paymentMethod } = req.body;

        if (paymentMethod !== 'razorpay') {
            if (user.walletBalance < course.price) {
                return res.status(400).json({ success: false, message: 'Insufficient balance' });
            }
            // Deduct balance
            user.walletBalance -= course.price;
            await user.save();
        }

        // Create transaction
        await Transaction.create({
            userId,
            amount: course.price,
            type: 'debit',
            description: `Enrolled in Course: ${course.title}`,
            referenceType: 'Course'
        });

        // Create order for course enrollment
        const courseOrder = await Order.create({
            userId,
            items: [{
                courseId: course._id,
                name: course.title,
                price: course.price,
                quantity: 1,
                itemType: 'Course'
            }],
            totalAmount: course.price,
            paymentStatus: paymentMethod === 'razorpay' ? 'pending' : 'paid',
            paymentMethod: paymentMethod || 'wallet',
            status: 'processing'
        });

        // Emit real-time event to user about order creation
        const io = getIO();
        if (io) {
            io.to(`user_${userId}`).emit('order_created', {
                orderId: courseOrder._id,
                items: courseOrder.items,
                totalAmount: courseOrder.totalAmount,
                paymentStatus: courseOrder.paymentStatus,
                status: courseOrder.status,
                timestamp: courseOrder.createdAt
            });
        }

        await User.findByIdAndUpdate(userId, {
            $addToSet: { enrolledCourses: course._id },
        });

        // Notify user
        await createNotification({
            userId,
            title: 'Enrollment Successful',
            body: `You are now enrolled in the course: ${course.title}`,
            type: 'general'
        });

        res.status(200).json({
            success: true,
            message: 'Enrolled successfully',
            balance: user.walletBalance,
            courseId: courseIdStr,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- Pooja Controllers ---
export const bookPooja = async (req, res) => {
    try {
        const { astrologerId } = req.params;
        const { poojaType, amount, scheduledDate, notes, paymentMethod } = req.body;
        const userId = req.user._id;

        const astrologer = await Astrologer.findById(astrologerId);
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });

        const user = await User.findById(userId);
        
        // Only deduct from wallet if not using razorpay or cod
        if (paymentMethod !== 'razorpay' && paymentMethod !== 'cod') {
            if (user.walletBalance < amount) {
                return res.status(400).json({ success: false, message: 'Insufficient balance' });
            }
            // Deduct balance
            user.walletBalance -= amount;
            await user.save();
        }

        // Create booking
        const booking = await PoojaBooking.create({
            userId,
            astrologerId,
            poojaType: poojaType || 'Personal Pooja',
            amount,
            scheduledDate,
            notes,
            paymentMethod: paymentMethod || 'wallet',
            paymentStatus: paymentMethod === 'razorpay' ? 'pending' : paymentMethod === 'cod' ? 'pending' : 'paid',
            status: 'pending'
        });

        // Create transaction
        await Transaction.create({
            userId,
            amount,
            type: 'debit',
            description: `Booked Pooja: ${poojaType || 'Personal Pooja'} with ${astrologer.personalDetails.name}`,
            referenceType: 'PoojaBooking',
            referenceId: booking._id
        });

        // Create order for pooja booking
        const poojaOrder = await Order.create({
            userId,
            items: [{
                name: poojaType || 'Personal Pooja',
                price: amount,
                quantity: 1,
                itemType: 'PoojaBooking'
            }],
            totalAmount: amount,
            paymentStatus: paymentMethod === 'razorpay' ? 'pending' : paymentMethod === 'cod' ? 'pending' : 'paid',
            paymentMethod: paymentMethod || 'wallet',
            status: 'pending'
        });

        // Emit real-time event to user about order creation
        try {
            const io = getIO();
            if (io) {
                io.to(`user_${userId}`).emit('order_created', {
                    orderId: poojaOrder._id,
                    items: poojaOrder.items,
                    totalAmount: poojaOrder.totalAmount,
                    paymentStatus: poojaOrder.paymentStatus,
                    status: poojaOrder.status,
                    timestamp: poojaOrder.createdAt
                });
            }
        } catch (socketErr) {
            console.error('Failed to emit order_created via socket:', socketErr.message);
        }

        // Notify user
        await createNotification({
            userId,
            title: 'Pooja Booked',
            body: `Your pooja request has been sent to ${astrologer.personalDetails.name}`,
            type: 'general'
        });

        res.status(201).json({ success: true, message: 'Pooja booked successfully', data: booking, balance: user.walletBalance });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getPoojaBookings = async (req, res) => {
    try {
        const bookings = await PoojaBooking.find({ userId: req.user._id }).populate('astrologerId');
        res.status(200).json({ success: true, data: bookings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- Cart Controllers (session-based, no Cart model needed) ---
// Simple in-memory cart per user (resets on server restart; use a Cart model for persistence)
const userCarts = new Map();

export const getCart = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const cart = userCarts.get(userId) || [];
        res.status(200).json({ success: true, items: cart });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const addToCart = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { productId, quantity = 1, clearExisting = false } = req.body;

        if (!productId) return res.status(400).json({ success: false, message: 'productId is required' });

        const cart = (clearExisting === true || clearExisting === 'true') ? [] : (userCarts.get(userId) || []);

        // Try to find real product details for display
        let productPlain = { _id: productId, product_name: 'Product', selling_price: 0, product_images: [] };
        try {
            if (productId.match(/^[0-9a-fA-F]{24}$/)) {
                const product = await Product.findById(productId).lean(); // .lean() gives a plain JS object
                if (product) {
                    const images = (product.product_images || []).map(img => resolveMediaUrl(img));
                    productPlain = {
                        _id: product._id.toString(),
                        product_name: product.product_name || product.name || 'Product',
                        selling_price: product.selling_price || product.base_price || product.price || 0,
                        product_images: images,
                        imageUrl: images[0] || null,
                        category: product.category || null,
                        stock: product.stock || 0,
                        itemSource: 'product',
                    };
                } else {
                    // Fallback: try Remedy collection (gemstones are stored as Remedies)
                    const remedy = await Remedy.findById(productId).lean();
                    if (remedy) {
                        const imageUrl = resolveMediaUrl(remedy.image || remedy.imageUrl || null);
                        productPlain = {
                            _id: remedy._id.toString(),
                            product_name: remedy.title || 'Gemstone',
                            selling_price: remedy.base_price || remedy.price || 0,
                            product_images: imageUrl ? [imageUrl] : [],
                            imageUrl: imageUrl,
                            image: imageUrl,
                            category: remedy.type || 'gemstone',
                            stock: 99, // Remedies don't have stock limits
                            itemSource: 'remedy',
                        };
                    }
                }
            }
        } catch (e) { /* ignore */ }

        const existingIdx = cart.findIndex(i => i.product?._id?.toString() === productId);
        if (existingIdx >= 0) {
            cart[existingIdx].quantity = (cart[existingIdx].quantity || 1) + quantity;
        } else {
            cart.push({ _id: `cart_${Date.now()}`, product: productPlain, quantity });
        }

        userCarts.set(userId, cart);
        res.status(200).json({ success: true, items: cart });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const removeFromCart = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { itemId } = req.params;
        const cart = userCarts.get(userId) || [];
        const updated = cart.filter(i => i._id !== itemId);
        userCarts.set(userId, updated);
        res.status(200).json({ success: true, items: updated });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateCartItem = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { itemId } = req.params;
        const { quantity } = req.body;
        const cart = userCarts.get(userId) || [];
        const idx = cart.findIndex(i => i._id === itemId);
        if (idx >= 0) cart[idx].quantity = quantity;
        userCarts.set(userId, cart);
        res.status(200).json({ success: true, items: cart });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const checkout = async (req, res) => {
    try {
        const userId = req.user._id;
        const { paymentMethod = 'wallet' } = req.body;
        const cart = userCarts.get(userId.toString()) || [];

        if (!cart || cart.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }

        // Validate payment method
        const validPaymentMethods = ['wallet', 'razorpay', 'cod'];
        if (!validPaymentMethods.includes(paymentMethod)) {
            return res.status(400).json({ success: false, message: 'Invalid payment method' });
        }

        // Calculate total amount
        const totalAmount = cart.reduce((sum, item) => sum + (item.product?.selling_price || 0) * item.quantity, 0);

        // Check wallet balance if using wallet payment
        const user = await User.findById(userId);
        if (paymentMethod !== 'razorpay' && paymentMethod !== 'cod') {
            if (user.walletBalance < totalAmount) {
                return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
            }
            // Deduct from wallet
            user.walletBalance -= totalAmount;
            await user.save();
        }

        // Update product stock and prepare items array
        const items = [];
        for (const cartItem of cart) {
            const isRemedy = cartItem.product?.itemSource === 'remedy';

            if (!isRemedy && cartItem.product && cartItem.product._id) {
                const product = await Product.findById(cartItem.product._id);
                if (product) {
                    if (product.stock < cartItem.quantity) {
                        return res.status(400).json({ success: false, message: `Insufficient stock for ${product.product_name}` });
                    }
                    product.stock -= cartItem.quantity;
                    await product.save();
                }
            }

            items.push({
                productId: isRemedy ? undefined : cartItem.product?._id,
                remedyId: isRemedy ? cartItem.product?._id : undefined,
                name: cartItem.product?.product_name || 'Product',
                price: cartItem.product?.selling_price || 0,
                quantity: cartItem.quantity,
                itemType: isRemedy ? 'Remedy' : 'Product'
            });
        }

        // Create transaction (only for wallet/razorpay — not for COD since payment hasn't been received)
        if (paymentMethod !== 'cod') {
            await Transaction.create({
                userId,
                amount: totalAmount,
                type: 'debit',
                description: `Cart Checkout - ${items.length} item(s) via ${paymentMethod}`,
                referenceType: 'Order'
            });
        }

        // Create order
        const estimatedDelivery = calculateEstimatedDelivery(items);
        
        let finalShippingAddress = undefined;
        const reqAddress = req.body.shippingAddress;
        if (reqAddress) {
            finalShippingAddress = {
                fullName: reqAddress.fullName,
                phone: reqAddress.phone || reqAddress.phoneNumber,
                address: reqAddress.address || reqAddress.addressLine1,
                addressLine1: reqAddress.addressLine1,
                addressLine2: reqAddress.addressLine2,
                city: reqAddress.city,
                state: reqAddress.state,
                pincode: reqAddress.pincode
            };
        } else {
            finalShippingAddress = user.addresses?.find(a => a.isDefault) || (user.addresses?.length > 0 ? user.addresses[0] : undefined);
        }

        const order = await Order.create({
            userId,
            items,
            totalAmount,
            estimatedDelivery,
            paymentStatus: paymentMethod === 'razorpay' ? 'pending' : paymentMethod === 'cod' ? 'pending' : 'paid',
            paymentMethod,
            status: paymentMethod === 'cod' ? 'pending' : paymentMethod === 'razorpay' ? 'payment_pending' : 'processing',
            shippingAddress: finalShippingAddress
        });

        // Clear the cart
        userCarts.delete(userId.toString());

        // Emit real-time event to user about order creation
        try {
            const io = getIO();
            if (io) {
                io.to(`user_${userId}`).emit('order_created', {
                    orderId: order._id,
                    items: order.items,
                    totalAmount: order.totalAmount,
                    paymentStatus: order.paymentStatus,
                    status: order.status,
                    timestamp: order.createdAt
                });
            }
        } catch (socketErr) {
            console.error('Failed to emit order_created via socket:', socketErr.message);
        }

        // Create notification
        await createNotification({
            userId,
            title: 'Order Placed',
            body: `Your order has been successfully placed with ${items.length} item(s)`,
            type: 'general'
        });

        await notifySellersNewOrder(order);
        if (order.paymentStatus === 'paid') {
            await creditSellersForOrder(order);
        }

        // Send COD confirmation if payment method is COD
        if (paymentMethod === 'cod') {
            try {
                const confirmationResult = await sendCODConfirmation(order, user);
                order.codConfirmationSent = {
                    emailSent: confirmationResult.emailSent,
                    smsSent: confirmationResult.smsSent,
                    sentAt: new Date()
                };
                await order.save();
            } catch (error) {
                console.error('Failed to send COD confirmation:', error.message);
                // Don't fail the checkout if confirmation fails
            }
        }

        res.status(201).json({ 
            success: true, 
            message: 'Checkout successful', 
            order: order,
            balance: user.walletBalance 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- Address Controllers ---
export const getAddresses = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        res.status(200).json({ success: true, addresses: user.addresses || [] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const addAddress = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (!user.addresses) user.addresses = [];

        const newAddress = {
            fullName: req.body.fullName,
            phone: req.body.phone || req.body.phoneNumber,
            addressLine1: req.body.addressLine1,
            addressLine2: req.body.addressLine2,
            city: req.body.city,
            state: req.body.state,
            pincode: req.body.pincode,
            type: (req.body.type || req.body.addressType || 'home').toLowerCase(),
            isDefault: req.body.isDefault === true,
        };

        if (!newAddress.fullName || !newAddress.addressLine1 || !newAddress.city || !newAddress.state || !newAddress.pincode) {
            return res.status(400).json({ success: false, message: 'Missing required address fields' });
        }

        if (newAddress.isDefault) {
            user.addresses.forEach(a => { a.isDefault = false; });
        } else if (user.addresses.length === 0) {
            newAddress.isDefault = true;
        }

        user.addresses.push(newAddress);
        await user.save();
        res.status(201).json({ success: true, addresses: user.addresses });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const setDefaultAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        const user = await User.findById(req.user._id);
        if (!user?.addresses?.length) {
            return res.status(404).json({ success: false, message: 'No addresses found' });
        }

        let found = false;
        user.addresses.forEach(a => {
            const isTarget = a._id.toString() === addressId;
            a.isDefault = isTarget;
            if (isTarget) found = true;
        });

        if (!found) return res.status(404).json({ success: false, message: 'Address not found' });

        await user.save();
        res.status(200).json({ success: true, addresses: user.addresses });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getEnrolledCourseIds = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId).select('enrolledCourses').lean();
        const enrolledIds = new Set(
            (user?.enrolledCourses || []).map((id) => id.toString())
        );

        const orders = await Order.find({
            userId,
            status: { $nin: ['cancelled'] },
            'items.itemType': 'Course',
        }).select('items').lean();

        for (const order of orders) {
            for (const item of order.items || []) {
                if (item.courseId) enrolledIds.add(item.courseId.toString());
            }
        }

        if (enrolledIds.size > 0) {
            const objectIds = Array.from(enrolledIds)
                .filter((id) => mongoose.Types.ObjectId.isValid(id))
                .map((id) => new mongoose.Types.ObjectId(id));
            if (objectIds.length > 0) {
                await User.findByIdAndUpdate(userId, {
                    $addToSet: { enrolledCourses: { $each: objectIds } },
                });
            }
        }

        res.status(200).json({ success: true, data: Array.from(enrolledIds) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        const user = await User.findById(req.user._id);
        if (!user.addresses) user.addresses = [];
        const idx = user.addresses.findIndex(a => a._id.toString() === addressId);
        
        if (idx === -1) return res.status(404).json({ success: false, message: 'Address not found' });
        
        if (req.body.isDefault) {
            user.addresses.forEach(a => a.isDefault = false);
        }
        
        user.addresses[idx] = { ...user.addresses[idx].toObject(), ...req.body };
        await user.save();
        res.status(200).json({ success: true, addresses: user.addresses });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        const user = await User.findById(req.user._id);
        user.addresses = user.addresses.filter(a => a._id.toString() !== addressId);
        await user.save();
        res.status(200).json({ success: true, addresses: user.addresses });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getResources = async (req, res) => {
    try {
        const Resource = (await import('../models/Resource.js')).default;
        const TrainingModule = (await import('../models/TrainingModule.js')).default;
        const { normalizeMediaPath } = await import('../utils/astrologerLink.js');

        const standalone = await Resource.find().sort({ createdAt: -1 }).lean();
        const modules = await TrainingModule.find({ isPublished: true })
            .select('title category resources')
            .sort({ sortOrder: 1, createdAt: -1 })
            .lean();

        const fromModules = [];
        for (const m of modules) {
            for (const r of m.resources || []) {
                if (!r?.url && !r?.title) continue;
                fromModules.push({
                    title: r.title || 'Resource',
                    description: `From training module: ${m.title}`,
                    type: r.type || 'link',
                    url: normalizeMediaPath(r.url),
                    category: m.category || 'General',
                    moduleId: m._id,
                    moduleTitle: m.title,
                    source: 'training',
                });
            }
        }

        const merged = [
            ...standalone.map((s) => ({ ...s, source: 'resource' })),
            ...fromModules,
        ];

        res.status(200).json({ success: true, data: merged });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getMyOrders = async (req, res) => {
    try {
        const userId = req.user._id;
        const orders = await Order.find({ userId }).sort({ createdAt: -1 }).lean();

        for (const order of orders) {
            for (const item of order.items || []) {
                if (item.productId) {
                    const product = await Product.findById(item.productId)
                        .select('product_name product_images')
                        .lean();
                    if (product) {
                        item.name = item.name || product.product_name;
                        const img = product.product_images?.[0];
                        item.imageUrl = img ? resolveMediaUrl(img) : null;
                    }
                } else if (item.remedyId) {
                    const remedy = await Remedy.findById(item.remedyId)
                        .select('title image')
                        .lean();
                    if (remedy) {
                        item.name = item.name || remedy.title;
                        const img = remedy.image || remedy.imageUrl;
                        item.imageUrl = img ? resolveMediaUrl(img) : null;
                    }
                }
            }
        }

        res.status(200).json({
            success: true,
            data: { orders },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
