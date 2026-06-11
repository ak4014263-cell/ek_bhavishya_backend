import express from 'express';
import { 
    initiateCall, 
    endCall, 
    confirmCallConnection, 
    getCallDetails,
    cancelCall,
    addCallNote,
    initiateChat,
    endChat,
    addMoney,
    uploadChatAttachment,
    uploadChatFileGeneric,
    addChatNote,
    getWalletHistory,
    requestOtp,
    verifyOtp,
    getProfile,
    updateProfile,
    getAstrologers,
    getAstrologerById,
    submitReview,
    updateFcmToken,
    getNotifications,
    markNotificationRead,
    getChatHistory,
    getCallHistory,
    getChatMessages,
    getChatDetails,
    followAstrologer,
    checkFollowStatus,
    getFollows,
    getReferralData,
    getRTCConfig,
    submitCEOFeedback,
    requestAccountDeletion
} from '../controllers/userController.js';
import { protect, optionalProtect, protectBearerOrQueryToken } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import { 
    getDailyHoroscope, 
    generateKundali, 
    getTarotReading, 
    kundliMatching, 
    getMangalDosha, 
    getPanchang, 
    getMuhurta, 
    getNumerology, 
    getTransitForecast 
} from '../controllers/astrologyController.js';

import { 
    getRemedies, 
    getRemedyById,
    bookRemedy, 
    getProducts, 
    purchaseProduct, 
    getCourses, 
    enrollInCourse,
    getCourseModules,
    getCourseContentAsset,
    bookPooja,
    getPoojaBookings,
    getCart,
    addToCart,
    removeFromCart,
    updateCartItem,
    checkout,
    getAddresses,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
    getEnrolledCourseIds,
    getMyOrders
} from '../controllers/serviceController.js';
import { getUserCourseLive } from '../controllers/courseLiveController.js';

const router = express.Router();

// Service Routes (Remedies, Store, Courses)
router.get('/remedies', getRemedies);
router.get('/remedies/:remedyId', getRemedyById);
router.post('/remedies/:remedyId/book', protect, bookRemedy);

router.get('/products', getProducts);
router.post('/products/:productId/purchase', protect, purchaseProduct);

router.get('/courses', getCourses);
router.get('/courses/enrolled-ids', protect, getEnrolledCourseIds);
router.get('/courses/:courseId/live', optionalProtect, getUserCourseLive);
router.get('/courses/:courseId/modules', optionalProtect, getCourseModules);
router.get('/courses/:courseId/asset', protectBearerOrQueryToken, getCourseContentAsset);
router.post('/courses/:courseId/enroll', protect, enrollInCourse);

router.post('/pooja/:astrologerId/book', protect, bookPooja);
router.get('/pooja/bookings', protect, getPoojaBookings);

// Cart Routes
router.get('/cart', protect, getCart);
router.post('/cart/add', protect, addToCart);
router.delete('/cart/item/:itemId', protect, removeFromCart);
router.put('/cart/item/:itemId', protect, updateCartItem);
router.post('/checkout', protect, checkout);

// Address Routes
router.get('/addresses', protect, getAddresses);
router.post('/addresses', protect, addAddress);
router.put('/addresses/:addressId', protect, updateAddress);
router.patch('/addresses/:addressId/default', protect, setDefaultAddress);
router.delete('/addresses/:addressId', protect, deleteAddress);

// Order Routes
router.get('/orders', protect, getMyOrders);
router.post('/orders/create', protect, async (req, res) => res.status(200).json({ success: true, message: 'Order placed' }));
router.get('/orders/track/:orderId', protect, async (req, res) => res.status(200).json({ success: true, data: {} }));

// Call Routes
router.get('/calls/history', protect, getCallHistory);
router.get('/calls/rtc-config', protect, getRTCConfig);
router.post('/calls/initiate', protect, initiateCall);
router.get('/calls/:callId', protect, getCallDetails);
router.post('/calls/:callId/connected', protect, confirmCallConnection);
router.post('/calls/:callId/cancel', protect, cancelCall);
router.post('/calls/:callId/end', protect, endCall);
router.post('/calls/:callId/note', protect, addCallNote);

// Chat Routes
router.post('/chat/initiate/:astrologerId', protect, initiateChat);
router.post('/chat/:sessionId/end', protect, endChat);
router.post('/chat/upload', protect, upload.single('file'), uploadChatFileGeneric);
router.post('/chat/:sessionId/upload', protect, upload.array('files'), uploadChatAttachment);
router.post('/chat/:sessionId/note', protect, addChatNote);
router.get('/chat/session/:sessionId', protect, getChatDetails);
router.get('/chat/:sessionId/messages', protect, getChatMessages);
router.get('/chat/history', protect, getChatHistory);

// Wallet Routes
router.post('/wallet/add', protect, addMoney);
router.get('/wallet/history', protect, getWalletHistory);
router.get('/wallet/transactions', protect, getWalletHistory); // Alias for compatibility

// Notification Routes
router.post('/fcm-token', protect, updateFcmToken);
router.get('/notifications', protect, getNotifications);
router.put('/notifications/:notificationId/read', protect, markNotificationRead);

// Profile Routes
router.get('/profile', protect, getProfile);
router.put('/profile', protect, upload.single('profilePhoto'), updateProfile);
router.post('/profile/delete-request', protect, requestAccountDeletion);

// Astrologer List
router.get('/astrologers/all', getAstrologers);
router.get('/astrologers/:astrologerId', getAstrologerById);

// Review Routes
router.post('/reviews/submit', protect, submitReview);

// Feedback Routes
router.post('/feedback/ceo', protect, submitCEOFeedback);

// Follow Routes
router.post('/astrologers/:astrologerId/follow', protect, followAstrologer);
router.get('/astrologers/:astrologerId/is-following', protect, checkFollowStatus);
router.get('/follows', protect, getFollows);

// Referral Routes
router.get('/referral', protect, getReferralData);

// OTP Routes
router.post('/email/request-otp', requestOtp);
router.post('/email/verify-otp', verifyOtp);
router.post('/phone/request-otp', requestOtp);
router.post('/phone/verify-otp', verifyOtp);

// Astrology Routes
router.post('/horoscope/daily', getDailyHoroscope);
router.post('/kundli', generateKundali);
router.post('/tarot-reading', getTarotReading);
router.post('/kundli-matching', kundliMatching);
router.post('/mangal-dosha', getMangalDosha);
router.post('/panchang', getPanchang);
router.post('/muhurta', getMuhurta);
router.post('/numerology', getNumerology);
router.post('/transit-forecast', getTransitForecast);

export default router;
