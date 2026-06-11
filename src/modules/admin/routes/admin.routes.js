import express from 'express';
import adminControllers from '../controllers/admin.controllers.js';
import astrologerController from '../controllers/astrologer.controller.js';
import sellerController from '../controllers/seller.controller.js';
import userController from '../controllers/user.controller.js';
import courseController from '../controllers/course.controller.js';
import productController from '../controllers/product.controller.js';
import noticeControllers from '../controllers/notice.controller.js';
import callRoutes from './call.routes.js';
import dashboardController from '../controllers/dashboard.controller.js';
import protectAdmin from '../middleware/protectAdmin.js';
import lessonController from '../controllers/lesson.controller.js';
import upload from '../../../middleware/upload.js';
import reportController from '../controllers/report.controller.js';
import blogController from '../controllers/blog.controller.js';
import bannerController from '../controllers/banner.controller.js';
import payoutController from '../controllers/payout.controller.js';
import interviewRoutes from './InterviewRoutes.js';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

import Transaction from '../../../models/Transaction.js';
import Order from '../../../models/Order.js';
import Remedy from '../../../models/Remedy.js';
import Notification from '../../../models/Notification.js';
import Feedback from '../../../models/Feedback.js';
import TrainingModule from '../../../models/TrainingModule.js';
import * as trainingController from '../../../controllers/adminTraining.controller.js';

const router = express.Router();

router.post('/login', adminControllers.login);
router.post('/auth/login', adminControllers.login);
// Temporary seed route to create admin user
router.get('/seed', async (req, res) => {
    try {
        const Admin = (await import('../models/admin.model.js')).default;
        const email = 'admin@ekbhavishya.com';
        const existingAdmin = await Admin.findOne({ email });
        if (existingAdmin) {
            return res.status(200).json({ success: true, message: 'Admin already exists' });
        }
        await Admin.create({
            name: 'Super Admin',
            email,
            password: 'adminpassword',
            role: 'admin'
        });
        res.status(201).json({ success: true, message: 'Admin created successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// User routes
router.get('/users', protectAdmin, userController.getAllUsers);
router.get('/users/:id', protectAdmin, userController.getUser);
router.post('/users', protectAdmin, userController.createUser);
router.patch('/users/block', protectAdmin, userController.blockUser);
router.patch('/users/unblock', protectAdmin, userController.unblockUser);
router.patch('/users/:id/toggle', protectAdmin, userController.toggleUserStatus);
router.patch('/users/:id', protectAdmin, upload.single('profilePhoto'), userController.editUser);
router.delete('/users/:id', protectAdmin, userController.deleteUser);

// Astrologer routes - More specific routes first
router.get('/astrologers/top', protectAdmin, astrologerController.getTopAstrologers);
router.get('/astrologers', protectAdmin, astrologerController.getAllAstrologers);
router.patch('/astrologers/suspend', protectAdmin, astrologerController.suspendAstrologer);
router.put('/astrologers/suspend', protectAdmin, astrologerController.suspendAstrologer);
router.patch('/astrologers/unsuspend', protectAdmin, astrologerController.unsuspendAstrologer);
router.put('/astrologers/unsuspend', protectAdmin, astrologerController.unsuspendAstrologer);
router.post('/astrologers/sync-user', protectAdmin, astrologerController.syncAstrologerUserAccount);
router.patch('/astrologers/:id/approve', protectAdmin, astrologerController.approveAstrologer);
router.patch('/astrologers/:id/reject', protectAdmin, astrologerController.rejectAstrologer);
router.patch('/astrologers/:id', protectAdmin, upload.fields([
  { name: 'profileImage', maxCount: 1 },
  { name: 'aadharCard', maxCount: 1 },
  { name: 'panCard', maxCount: 1 },
  { name: 'educationalCertificates', maxCount: 5 }
]), astrologerController.editAstrologer);
router.delete('/astrologers/:id', protectAdmin, astrologerController.deleteAstrologer);

// Seller routes
router.get('/sellers', protectAdmin, sellerController.getAllSellers);
router.patch('/sellers/approve', protectAdmin, sellerController.approveSeller);
router.patch('/sellers/reject', protectAdmin, sellerController.rejectSeller);
router.patch('/sellers/revert', protectAdmin, sellerController.revertSeller);
router.patch('/sellers/:id', protectAdmin, upload.fields([
  { name: 'profile_image', maxCount: 1 },
  { name: 'adhar_document', maxCount: 1 },
  { name: 'pan_document', maxCount: 1 }
]), sellerController.editSeller);
router.delete('/sellers/:id', protectAdmin, sellerController.deleteSeller);

// Product routes
router.get('/products', protectAdmin, productController.getAllProducts);
router.post('/products', protectAdmin, upload.array('images', 5), productController.createProduct);
router.get('/products/:id', protectAdmin, productController.getProductById);
router.patch('/products/:id/approve', protectAdmin, productController.approveProduct);
router.patch('/products/:id/reject', protectAdmin, productController.rejectProduct);
router.patch('/products/:id/revert', protectAdmin, productController.revertProduct);
router.patch('/products/:id', protectAdmin, productController.editProduct);
router.delete('/products/:id', protectAdmin, productController.deleteProduct);

// Courses Routes
router.get('/courses/unified', protectAdmin, courseController.getUnifiedCourses); // Overarching search - ALL courses
router.get('/courses', protectAdmin, courseController.getAdminCourses); // List admin courses only
router.post('/courses', protectAdmin, upload.single('thumbnail'), courseController.createAdminCourse); // Create parent

// Approval Logic (MUST be before :id routes)
router.patch('/courses/:id/approve', protectAdmin, courseController.approveCourse);
router.patch('/courses/:id/reject', protectAdmin, courseController.rejectCourse);
router.patch('/courses/:id/revert', protectAdmin, courseController.revertCourse);

router.get('/courses/:id', protectAdmin, courseController.getCourseById);
router.patch('/courses/:id', protectAdmin, upload.single('thumbnail'), courseController.updateAdminCourse);
router.delete('/courses/:id', protectAdmin, courseController.deleteAdminCourse);

// Modules
router.get('/courses/:id/modules', protectAdmin, courseController.getCourseModules); // Module dropdown

router.post('/notices', protectAdmin, noticeControllers.createNotice);
router.get('/notices', protectAdmin, noticeControllers.getNotices);
router.post('/notices/get-by-id', protectAdmin, noticeControllers.getNoticeById);
router.patch('/notices/update', protectAdmin, noticeControllers.updateNotice);
router.delete('/notices/delete', protectAdmin, noticeControllers.deleteNotice);
router.post('/notices/get-notifications', protectAdmin, noticeControllers.getNotificationsByNotice);

// Call management routes
router.use('/', callRoutes);
router.use('/interviews', protectAdmin, interviewRoutes);
router.get('/dashboard/stats', protectAdmin, dashboardController.getDashboardStats);
router.get('/dashboard/consultation-stats', protectAdmin, dashboardController.getConsultationStats);
router.get('/dashboard/revenue-stats', protectAdmin, dashboardController.getRevenueStats);
router.get('/dashboard/engagement-stats', protectAdmin, dashboardController.getEngagementStats);
router.get('/analytics', protectAdmin, dashboardController.getAnalytics);
router.post('/notifications/send', protectAdmin, dashboardController.sendNotification);
router.get('/reports/daily-usage', protectAdmin, reportController.getDailyUsageAnalytics);
router.get('/reports/user-activity', protectAdmin, userController.getUserActivityStats);

// Blog management routes
router.get('/blogs', protectAdmin, blogController.getAllBlogs);
router.post('/blogs', protectAdmin, upload.fields([{ name: 'image', maxCount: 1 }]), blogController.createBlog);
router.post('/blogs/get-by-id', protectAdmin, blogController.getBlogById);
router.patch('/blogs/approve', protectAdmin, blogController.approveBlog);
router.patch('/blogs/reject', protectAdmin, blogController.rejectBlog);
router.patch('/blogs/:id/toggle', protectAdmin, async (req, res) => {
    try {
        const Blog = (await import('../../../models/Blog.js')).default;
        const blog = await Blog.findById(req.params.id);
        if (!blog) return res.status(404).json({ success: false });
        blog.status = blog.status === 'Approved' ? 'Draft' : 'Approved';
        await blog.save();
        res.json({ success: true, blog });
    } catch (e) { res.status(500).json({ success: false }); }
});
router.patch('/blogs/:id', protectAdmin, upload.fields([{ name: 'image', maxCount: 1 }]), blogController.updateBlog);
router.delete('/blogs/:id', protectAdmin, blogController.deleteBlog);

router.post('/lessons', protectAdmin, upload.array('files'), lessonController.createLesson);
router.get('/lessons/:id', protectAdmin, lessonController.getLessonById);
router.get('/lessons/course/:courseId/:moduleId', protectAdmin, lessonController.getLessonsByCourseAndModule);
router.patch('/lessons/:id', protectAdmin, upload.single('document'), lessonController.updateLesson);

// Banner management routes
router.get('/banners', protectAdmin, bannerController.getBanners);
router.post('/banners', protectAdmin, upload.single('image'), bannerController.createBanner);
router.put('/banners/:id', protectAdmin, upload.single('image'), bannerController.updateBanner);
router.patch('/banners/:id/toggle', protectAdmin, bannerController.toggleBanner);
router.delete('/banners/:id', protectAdmin, bannerController.deleteBanner);
router.post('/banners/reorder', protectAdmin, bannerController.reorderBanners);

// Payout management routes
router.get('/payouts', protectAdmin, payoutController.getPayouts);
router.patch('/payouts/:id/status', protectAdmin, payoutController.updatePayoutStatus);

// Mock endpoints to satisfy Flutter Admin Panel requirements
router.get('/sessions', protectAdmin, async (req, res) => {
  try {
    const ChatSession = (await import('../../../models/ChatSession.js')).default;
    const sessions = await ChatSession.find()
      .populate('userId', 'fullName email')
      .populate('astrologerId', 'personalDetails.name personalDetails.email')
      .sort({ createdAt: -1 }).limit(50).lean();
    const mapped = sessions.map(s => ({
      _id: s._id,
      user: s.userId?.fullName || 'Unknown',
      astrologer: s.astrologerId?.personalDetails?.name || 'Unknown',
      status: s.status,
      type: s.type || 'chat',
      duration: s.duration || 0,
      createdAt: s.createdAt,
    }));
    res.json({ success: true, data: mapped, sessions: mapped, pagination: { total: mapped.length, page: 1, pages: 1 } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/live-sessions', protectAdmin, async (req, res) => {
  try {
    const LiveSession = (await import('../../../models/LiveSession.js')).default;
    const lives = await LiveSession.find()
      .populate('astrologerId', 'personalDetails.name personalDetails.email')
      .sort({ createdAt: -1 }).limit(30).lean();
    const mapped = lives.map(l => ({
      _id: l._id,
      astrologer: l.astrologerId?.personalDetails?.name || 'Unknown',
      title: l.title || 'Live Session',
      status: l.status || 'ended',
      viewers: l.viewers?.length || l.currentViewersCount || 0,
      peakViewers: l.maxViewers || 0,
      duration: l.endTime && l.startTime
        ? Math.round((new Date(l.endTime) - new Date(l.startTime)) / 60000)
        : 0,
      startedAt: l.startTime,
      endedAt: l.endTime,
      createdAt: l.createdAt,
    }));
    res.json({ success: true, data: mapped, liveSessions: mapped, pagination: { total: mapped.length, page: 1, pages: 1 } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/transactions', protectAdmin, async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate('userId', 'fullName email phoneNumber')
      .populate({
        path: 'astrologerId',
        select: 'personalDetails userId',
        populate: { path: 'userId', select: 'fullName email' }
      })
      .populate('sellerId', 'business_name fullname storeName')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const resolveName = (t) => {
      if (t.userId) {
        if (t.userId.fullName) return t.userId.fullName;
        if (t.userId.email) return t.userId.email;
        if (t.userId.phoneNumber) return t.userId.phoneNumber;
      }
      if (t.astrologerId) {
        if (t.astrologerId.personalDetails?.name) return t.astrologerId.personalDetails.name;
        if (t.astrologerId.personalDetails?.pseudonym) return t.astrologerId.personalDetails.pseudonym;
        if (t.astrologerId.userId?.fullName) return t.astrologerId.userId.fullName;
        if (t.astrologerId.personalDetails?.email) return t.astrologerId.personalDetails.email;
      }
      if (t.sellerId) {
        if (t.sellerId.business_name) return t.sellerId.business_name;
        if (t.sellerId.fullname) return t.sellerId.fullname;
        if (t.sellerId.storeName) return t.sellerId.storeName;
      }
      return 'System';
    };

    const data = transactions.map((t) => {
      const created = t.createdAt ? new Date(t.createdAt) : new Date();
      const uiStatus = t.status === 'completed' ? 'success' : t.status;
      return {
        ...t,
        user: resolveName(t),
        userName: resolveName(t),
        desc: t.description || t.referenceType || 'Transaction',
        method: t.paymentGatewayId ? 'Online' : (t.referenceType || 'Wallet'),
        date: created.toISOString().split('T')[0],
        time: created.toTimeString().slice(0, 5),
        status: uiStatus,
      };
    });

    res.json({ success: true, data, pagination: { total: data.length, page: 1, pages: 1 } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/orders', protectAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status: status.toLowerCase() } : {};
    const orders = await Order.find(filter)
      .populate('userId', 'fullName email phoneNumber')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const formatAddress = (shipping) => {
      if (!shipping || typeof shipping !== 'object') return '';
      const parts = [
        shipping.address || shipping.addressLine1,
        shipping.addressLine2,
        shipping.city,
        shipping.state,
        shipping.pincode,
      ].filter(Boolean);
      return parts.join(', ');
    };

    const data = orders.map((o) => {
      const resolvedUser = o.userId?.fullName || 
                           o.userId?.email || 
                           o.userId?.phoneNumber || 
                           o.shippingAddress?.fullName || 
                           (o.userId ? `User (${o.userId._id || o.userId})` : 'Guest Customer');
      return {
        ...o,
        id: o._id,
        user: resolvedUser,
        userName: resolvedUser,
      items: (o.items || []).map((i) => `${i.name || 'Item'} x${i.quantity || 1}`),
      itemDetails: o.items || [],
      total: o.totalAmount,
      totalAmount: o.totalAmount,
      address: formatAddress(o.shippingAddress),
      date: o.createdAt,
      };
    });

    res.json({ success: true, data, pagination: { total: data.length, page: 1, pages: 1 } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.patch('/orders/:id/status', protectAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const normalizedStatus = status ? status.toLowerCase() : status;
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(normalizedStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    order.status = normalizedStatus;
    if (normalizedStatus === 'delivered' && order.paymentMethod === 'cod') {
      order.paymentStatus = 'paid';
    }
    await order.save();

    const { broadcastOrderStatusChange } = await import('../../../utils/orderEvents.js');
    await broadcastOrderStatusChange(order, { notifyUser: true, creditEarnings: true });

    res.json({ success: true, message: `Order status updated to ${normalizedStatus}`, order });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/remedies', protectAdmin, async (req, res) => {
  try {
     const remedies = await Remedy.find().populate('astrologerId', 'personalDetails.name').sort({ createdAt: -1 }).lean();
     const mapped = remedies.map(r => ({
       ...r,
       id: r._id,
       category: r.type || 'Mantra',
       published: r.status === 'Published',
       planet: r.planet || 'All',
       astrologerName: r.astrologerId?.personalDetails?.name || 'Admin',
     }));
     res.json({ success: true, data: mapped, pagination: { total: mapped.length, page: 1, pages: 1 } });
  } catch (e) { res.status(500).json({ success: false }); }
});

router.post('/remedies', protectAdmin, async (req, res) => {
    try {
        const { title, description, category, planet, published } = req.body;
        const remedy = await Remedy.create({
            title,
            description,
            type: category || 'Mantra',
            status: (published === true || published === 'true') ? 'Published' : 'Draft',
            astrologerId: null
        });
        
        const mapped = {
            ...remedy.toObject(),
            id: remedy._id,
            category: remedy.type,
            published: remedy.status === 'Published',
            planet: planet || 'All',
            astrologerName: 'Admin'
        };
        res.status(201).json({ success: true, data: mapped });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/remedies/:id', protectAdmin, async (req, res) => {
    try {
        const { title, description, category, planet, published } = req.body;
        const updateData = {
            title,
            description,
            type: category,
            status: (published === true || published === 'true') ? 'Published' : 'Draft'
        };
        const remedy = await Remedy.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!remedy) return res.status(404).json({ success: false, message: 'Remedy not found' });
        
        const mapped = {
            ...remedy.toObject(),
            id: remedy._id,
            category: remedy.type,
            published: remedy.status === 'Published',
            planet: planet || 'All',
            astrologerName: 'Admin'
        };
        res.json({ success: true, data: mapped });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.patch('/remedies/:id/toggle', protectAdmin, async (req, res) => {
    try {
        const remedy = await Remedy.findById(req.params.id);
        if (!remedy) return res.status(404).json({ success: false });
        remedy.status = remedy.status === 'Published' ? 'Draft' : 'Published';
        await remedy.save();
        
        const mapped = {
            ...remedy.toObject(),
            id: remedy._id,
            category: remedy.type,
            published: remedy.status === 'Published',
        };
        res.json({ success: true, data: mapped });
    } catch (e) { res.status(500).json({ success: false }); }
});

router.delete('/remedies/:id', protectAdmin, async (req, res) => {
    try {
        await Remedy.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Remedy deleted' });
    } catch (e) { res.status(500).json({ success: false }); }
});

router.get('/settings', protectAdmin, async (req, res) => {
    try {
        const Settings = (await import('../../../models/Settings.js')).default;
        let settings = await Settings.findOne();
        if (!settings) settings = await Settings.create({});
        res.json({ success: true, settings });
    } catch (e) { res.status(500).json({ success: false }); }
});

router.patch('/settings', protectAdmin, async (req, res) => {
    try {
        const Settings = (await import('../../../models/Settings.js')).default;
        const settings = await Settings.findOneAndUpdate({}, req.body, { new: true, upsert: true, returnDocument: 'after' });
        res.json({ success: true, settings });
    } catch (e) { res.status(500).json({ success: false }); }
});

router.post('/settings/reset', protectAdmin, adminControllers.resetSettings);
router.patch('/profile/update', protectAdmin, adminControllers.updateProfile);

router.get('/notifications', protectAdmin, async (req, res) => {
  try {
     // Only show summary records (no userId) which represent admin-sent notification history
     const notifications = await Notification.find({ userId: null }).sort({ createdAt: -1 }).limit(50);
     res.json({ success: true, history: notifications, pagination: { total: notifications.length, page: 1, pages: 1 } });
  } catch (e) { res.status(500).json({ success: false }); }
});

router.get('/feedback', protectAdmin, async (req, res) => {
  try {
     const Review = (await import('../../../models/Review.js')).default;
     const reviews = await Review.find()
       .populate('userId', 'fullName')
       .populate('astrologerId', 'personalDetails.name')
       .sort({ createdAt: -1 })
       .limit(50);
     
     const data = reviews.map(r => ({
       _id: r._id,
       user: r.isAnonymous ? 'Anonymous' : (r.userId?.fullName || 'Unknown User'),
       astrologer: r.astrologerId?.personalDetails?.name || 'Platform',
       rating: r.rating,
       comment: r.comment,
       visible: true,
       createdAt: r.createdAt
     }));

     res.json({ success: true, data, pagination: { total: reviews.length, page: 1, pages: 1 } });
  } catch (e) { 
    console.error('Admin Feedback Route Error:', e);
    res.status(500).json({ success: false, message: e.message }); 
  }
});

router.delete('/feedback/:id', protectAdmin, async (req, res) => {
    try {
        const Review = (await import('../../../models/Review.js')).default;
        await Review.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Review deleted' });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Admin Training Modules Management (resources, assignments, certifications per module)
router.get('/training', protectAdmin, trainingController.listTrainingModules);
router.post(
    '/training',
    protectAdmin,
    upload.fields([{ name: 'thumbnail', maxCount: 1 }, { name: 'video', maxCount: 1 }]),
    trainingController.createTrainingModule
);
router.put(
    '/training/:id',
    protectAdmin,
    upload.fields([{ name: 'thumbnail', maxCount: 1 }, { name: 'video', maxCount: 1 }]),
    trainingController.updateTrainingModule
);
router.delete('/training/:id', protectAdmin, trainingController.deleteTrainingModule);

// Admin Resource Management
router.get('/resources', protectAdmin, async (req, res) => {
    try {
        const Resource = (await import('../../../models/Resource.js')).default;
        const resources = await Resource.find().sort({ createdAt: -1 });
        res.json({ success: true, data: resources });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.post('/resources', protectAdmin, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), async (req, res) => {
    try {
        const Resource = (await import('../../../models/Resource.js')).default;
        const { title, description, type, category, url, thumbnail } = req.body;
        
        let fileUrl = url;
        let thumbUrl = thumbnail;

        if (req.files) {
            if (req.files.file && req.files.file.length > 0) {
                fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.files.file[0].filename}`;
            }
            if (req.files.thumbnail && req.files.thumbnail.length > 0) {
                thumbUrl = `${req.protocol}://${req.get('host')}/uploads/${req.files.thumbnail[0].filename}`;
            }
        }

        const resource = await Resource.create({
            title, description, type: type || 'document', url: fileUrl, thumbnail: thumbUrl, category
        });
        res.status(201).json({ success: true, data: resource });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/resources/:id', protectAdmin, async (req, res) => {
    try {
        const Resource = (await import('../../../models/Resource.js')).default;
        const resource = await Resource.findByIdAndDelete(req.params.id);
        if (!resource) return res.status(404).json({ success: false, message: 'Resource not found' });
        res.json({ success: true, message: 'Resource deleted' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Helper to generate a beautiful, luxury-grade official certificate PDF
async function generateCertificatePDF(astrologerName, certTitle) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            layout: 'landscape',
            size: 'A4',
            margin: 0
        });

        const dir = path.join(process.cwd(), 'uploads', 'certificates');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const fileName = `cert-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`;
        const filePath = path.join(dir, fileName);
        const stream = fs.createWriteStream(filePath);
        
        doc.pipe(stream);

        // Define premium color scheme
        const goldColor = '#D4AF37';
        const darkBlueColor = '#1A2E40';
        const charcoalColor = '#333333';
        const vellumBgColor = '#FCFBF7';

        // 1. Draw elegant vellum background
        doc.rect(0, 0, doc.page.width, doc.page.height).fill(vellumBgColor);

        // 2. Draw majestic gold double-border
        doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40)
           .lineWidth(3)
           .stroke(goldColor);

        // Draw elegant thin inner dark border
        doc.rect(28, 28, doc.page.width - 56, doc.page.height - 56)
           .lineWidth(1)
           .stroke(darkBlueColor);

        // 3. Draw ornate corners
        const drawCornerOrnament = (x, y, rotation) => {
            doc.save();
            doc.translate(x, y);
            doc.rotate(rotation);
            doc.rect(-5, -5, 10, 10).fill(goldColor);
            doc.rect(-2, -2, 4, 4).fill(darkBlueColor);
            doc.restore();
        };

        drawCornerOrnament(28, 28, 0);
        drawCornerOrnament(doc.page.width - 28, 28, 90);
        drawCornerOrnament(28, doc.page.height - 28, 270);
        drawCornerOrnament(doc.page.width - 28, doc.page.height - 28, 180);

        // 4. Header Section
        doc.fillColor(darkBlueColor)
           .font('Helvetica-Bold')
           .fontSize(16)
           .text('E K   B H A V I S H Y A', 0, 70, { align: 'center' });

        doc.fillColor(goldColor)
           .font('Helvetica-Bold')
           .fontSize(28)
           .text('CERTIFICATE OF EXCELLENCE', 0, 110, { align: 'center' });

        doc.fillColor(charcoalColor)
           .font('Helvetica-Oblique')
           .fontSize(14)
           .text('This official certificate is proudly presented to:', 0, 170, { align: 'center' });

        // 5. Astrologer Name (Large, styled)
        doc.fillColor(darkBlueColor)
           .font('Helvetica-Bold')
           .fontSize(36)
           .text(astrologerName.toUpperCase(), 0, 210, { align: 'center' });

        // Underline under name
        doc.moveTo(doc.page.width / 2 - 180, 255)
           .lineTo(doc.page.width / 2 + 180, 255)
           .lineWidth(1.5)
           .stroke(goldColor);

        // 6. Sub-description
        doc.fillColor(charcoalColor)
           .font('Helvetica')
           .fontSize(12)
           .text('in recognition of their outstanding professional standards, compliance, and excellence in providing astrological guidance in:', 0, 280, { align: 'center' });

        // 7. Certificate Title
        doc.fillColor(goldColor)
           .font('Helvetica-Bold')
           .fontSize(22)
           .text(certTitle.toUpperCase(), 0, 315, { align: 'center' });

        // 8. Seal and Signatures
        // Draw gold circular seal
        const sealX = doc.page.width / 2;
        const sealY = 430;
        doc.circle(sealX, sealY, 32)
           .fill(goldColor);
        doc.circle(sealX, sealY, 28)
           .lineWidth(1.5)
           .stroke('#FFFFFF');
        
        // Star inside seal
        doc.fillColor('#FFFFFF')
           .font('Helvetica-Bold')
           .fontSize(16)
           .text('★', sealX - 8, sealY - 9);

        // Authorized Signatory Line
        doc.moveTo(80, 450)
           .lineTo(240, 450)
           .lineWidth(1)
           .stroke(charcoalColor);
        doc.fillColor(charcoalColor)
           .font('Helvetica-Oblique')
           .fontSize(11)
           .text('Authorized Signatory', 80, 460, { width: 160, align: 'center' });
        doc.fillColor(darkBlueColor)
           .font('Courier-BoldOblique')
           .fontSize(14)
           .text('Ek Bhavishya Team', 80, 430, { width: 160, align: 'center' });

        // Issuance Date Line
        const issueDateStr = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        doc.moveTo(doc.page.width - 240, 450)
           .lineTo(doc.page.width - 80, 450)
           .lineWidth(1)
           .stroke(charcoalColor);
        doc.fillColor(charcoalColor)
           .font('Helvetica')
           .fontSize(11)
           .text(`Issued Date: ${issueDateStr}`, doc.page.width - 240, 460, { width: 160, align: 'center' });

        doc.end();

        stream.on('finish', () => {
            resolve(`/uploads/certificates/${fileName}`);
        });

        stream.on('error', (err) => {
            reject(err);
        });
    });
}

// Admin Astrologer Certificate Management
router.post('/astrologer/:id/certificate', protectAdmin, async (req, res) => {
    try {
        const Astrologer = (await import('../../../models/Astrologer.js')).default;
        const { title, url: certUrl } = req.body;

        const astrologer = await Astrologer.findById(req.params.id);
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        let finalCertUrl = certUrl;
        
        // If no URL is provided, automatically generate a stunning PDF certificate!
        if (!finalCertUrl || finalCertUrl.trim() === '' || finalCertUrl.includes('pdf-test.pdf')) {
            const name = (astrologer.personalDetails && astrologer.personalDetails.name) 
                || (astrologer.personalDetails && astrologer.personalDetails.pseudonym)
                || 'Professional Astrologer';
            
            finalCertUrl = await generateCertificatePDF(name, title || 'Professional Astrologer Certificate');
        }

        const updatedAstrologer = await Astrologer.findByIdAndUpdate(
            req.params.id,
            {
                $push: {
                    certificates: {
                        title: title || 'Professional Astrologer Certificate',
                        url: finalCertUrl,
                        issueDate: new Date()
                    }
                }
            },
            { new: true }
        );

        res.status(200).json({ success: true, data: updatedAstrologer.certificates });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Admin Astrologer Pricing Update Requests
router.post('/astrologer/:id/approve-price-request', protectAdmin, async (req, res) => {
    try {
        const Astrologer = (await import('../../../models/Astrologer.js')).default;
        const astrologer = await Astrologer.findById(req.params.id);
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        if (!astrologer.pricingUpdateRequest || astrologer.pricingUpdateRequest.status !== 'Pending') {
            return res.status(400).json({ success: false, message: 'No pending price update request found' });
        }

        // Apply requested prices
        astrologer.pricing.chat = astrologer.pricingUpdateRequest.chat;
        astrologer.pricing.call = astrologer.pricingUpdateRequest.call;
        astrologer.pricing.video = astrologer.pricingUpdateRequest.video;
        
        astrologer.pricingUpdateRequest.status = 'Approved';

        await astrologer.save();
        res.status(200).json({ success: true, message: 'Pricing request approved successfully', data: astrologer.pricing });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/astrologer/:id/reject-price-request', protectAdmin, async (req, res) => {
    try {
        const Astrologer = (await import('../../../models/Astrologer.js')).default;
        const astrologer = await Astrologer.findById(req.params.id);
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        if (!astrologer.pricingUpdateRequest || astrologer.pricingUpdateRequest.status !== 'Pending') {
            return res.status(400).json({ success: false, message: 'No pending price update request found' });
        }

        astrologer.pricingUpdateRequest.status = 'Rejected';

        await astrologer.save();
        res.status(200).json({ success: true, message: 'Pricing request rejected successfully', data: astrologer.pricingUpdateRequest });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Account Deletion Requests Management
router.get('/deletion-requests', protectAdmin, adminControllers.getDeletionRequests);
router.post('/deletion-requests/:id/approve', protectAdmin, adminControllers.approveDeletionRequest);
router.post('/deletion-requests/:id/reject', protectAdmin, adminControllers.rejectDeletionRequest);

export default router;
