import express from 'express';
import {
    loginSeller,
    registerSeller,
    getSellerProfile,
    updateSellerProfile,
    getSellerDashboardStats,
    getSellerProducts,
    getSellerOrders,
    updateSellerOrderStatus,
    addSellerProduct,
    updateSellerProduct,
    deleteSellerProduct,
    getSellerWallet,
    getSellerPayouts,
    getSellerPayoutStats,
    requestSellerPayout,
    getSellerReviews,
    getSellerNotifications,
    markSellerNotificationRead,
    markAllSellerNotificationsRead,
    downloadSellerDocument
} from '../controllers/seller.controller.js';
import { protect, authorize } from '../../../middleware/auth.js';
import upload from '../../../middleware/upload.js';

const router = express.Router();

router.post('/login', loginSeller);
router.post('/register', upload.fields([
    { name: 'profile_image', maxCount: 1 },
    { name: 'adhar_document', maxCount: 1 },
    { name: 'pan_document', maxCount: 1 }
]), registerSeller);
router.get('/profile', protect, authorize('seller'), getSellerProfile);
router.get('/documents/:type', protect, authorize('seller'), downloadSellerDocument);
router.put('/profile', protect, authorize('seller'), updateSellerProfile);
router.get('/dashboard-stats', protect, authorize('seller'), getSellerDashboardStats);
router.get('/dashboard', protect, authorize('seller'), getSellerDashboardStats);
router.get('/stats', protect, authorize('seller'), getSellerDashboardStats);
router.get('/products', protect, authorize('seller'), getSellerProducts);
router.get('/products/all', protect, authorize('seller'), getSellerProducts);
router.get('/wallet', protect, authorize('seller'), getSellerWallet);
router.post('/products', protect, authorize('seller'), upload.array('images', 5), addSellerProduct);
router.put('/products/:id', protect, authorize('seller'), upload.array('images', 5), updateSellerProduct);
router.delete('/products/:id', protect, authorize('seller'), deleteSellerProduct);

router.get('/orders', protect, authorize('seller'), getSellerOrders);
router.put('/orders/:id/status', protect, authorize('seller'), updateSellerOrderStatus);
router.get('/payouts', protect, authorize('seller'), getSellerPayouts);
router.get('/payouts/stats', protect, authorize('seller'), getSellerPayoutStats);
router.post('/payouts/request', protect, authorize('seller'), requestSellerPayout);
router.get('/reviews', protect, authorize('seller'), getSellerReviews);
router.get('/notifications', protect, authorize('seller'), getSellerNotifications);
router.post('/notifications/:id/read', protect, authorize('seller'), markSellerNotificationRead);
router.post('/notifications/read-all', protect, authorize('seller'), markAllSellerNotificationsRead);

export default router;
