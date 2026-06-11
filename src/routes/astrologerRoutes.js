import express from 'express';
import { 
    registerAstrologer, 
    loginAstrologer, 
    requestAstrologerOtp, 
    verifyAstrologerOtp,
    getAstrologerProfile,
    updateAstrologerProfile,
    getDashboardData,
    getAstrologers,
    getReviews,
    acceptCall,
    rejectCall,
    acceptChat,
    rejectChat,
    updateAvailability,

    getWaitlist,
    getChatMessages,
    getChatSession,
    endChat,
    endCall,
    getWalletSummary,
    getMyClients,
    changePassword,
    resetPassword,
    requestEmailChangeOtp,
    verifyEmailChangeOtp,
    updateAstrologerSettings,
    getCallEarnings,
    getAnalytics,
    getInternalNotes,
    saveInternalNote,
    uploadSampleReading,
    updateWebsiteSettings,
    confirmCallConnection,
    updateFcmToken,
    getNotifications,
    markNotificationRead,
    uploadInterviewDocument,
    updateBankDetails,
    requestWithdrawal,
    getTrainingModules,
    updateTrainingProgress,
    registerMasterclass,
    submitTrainingAssignment
} from '../controllers/astrologerController.js';
import { getRTCConfig } from '../controllers/userController.js';
import { createRemedy, getMyRemedies, getMyRemedyById, updateRemedy, deleteRemedy, addCourse, getMyCourses, getMyCourseById, deleteCourse, addCourseModule, addModuleContent, getResources, publishRemedy, unpublishRemedy, publishCourse, unpublishCourse } from '../controllers/serviceController.js';
import { startCourseMasterclass, getAstrologerCourseLive } from '../controllers/courseLiveController.js';
import upload, { courseContentUpload } from '../middleware/upload.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/', getAstrologers);
router.post(
    '/register', 
    upload.fields([
        { name: 'aadharCard', maxCount: 1 },
        { name: 'panCard', maxCount: 1 },
        { name: 'educationalCertificates', maxCount: 5 },
    ]),
    registerAstrologer
);
router.post('/login', loginAstrologer);
router.post('/otp/request', requestAstrologerOtp);
router.post('/otp/verify', verifyAstrologerOtp);
router.post('/reset-password', resetPassword);

// Protected Routes
router.get('/profile', protect, getAstrologerProfile);
router.put('/profile', protect, upload.single('profileImage'), updateAstrologerProfile);
router.post('/profile/sample-reading', protect, upload.single('sampleFile'), uploadSampleReading);
router.put('/change-password', protect, changePassword);
router.post('/request-email-otp', protect, requestEmailChangeOtp);
router.post('/verify-email-otp', protect, verifyEmailChangeOtp);
router.put('/settings', protect, updateAstrologerSettings);
router.put(
    '/website', 
    protect, 
    upload.fields([
        { name: 'logo', maxCount: 1 },
        { name: 'bannerImage', maxCount: 1 }
    ]), 
    updateWebsiteSettings
);



router.get('/dashboard', protect, getDashboardData);
router.get('/calls/earnings', protect, getCallEarnings);
router.get('/analytics', protect, getAnalytics);
router.get('/clients', protect, getMyClients);


// Review Routes
router.get('/reviews', protect, getReviews);
router.get('/:astrologerId/reviews', getReviews);

router.get('/', getAstrologers);

// Availability
router.put('/calls/availability', protect, updateAvailability);
router.get('/waitlist', protect, getWaitlist);


router.get('/calls/rtc-config', protect, getRTCConfig);

// Call & Chat Handlers
router.post('/calls/:callId/accept', protect, acceptCall);
router.post('/calls/:callId/reject', protect, rejectCall);
router.post('/calls/:callId/connected', protect, confirmCallConnection);
router.post('/calls/:callId/end', protect, endCall);
router.post('/chat/sessions/:sessionId/accept', protect, acceptChat);
router.post('/chat/sessions/:sessionId/reject', protect, rejectChat);
router.post('/chat/sessions/:sessionId/end', protect, endChat);

router.get('/chat/:sessionId', protect, getChatSession);
router.get('/chat/:sessionId/messages', protect, getChatMessages);
router.get('/wallet', protect, getWalletSummary);

router.get('/notes', protect, getInternalNotes);
router.post('/notes', protect, saveInternalNote);

router.put('/bank-details', protect, updateBankDetails);
router.post('/withdraw', protect, requestWithdrawal);

// Notification Routes
router.post('/fcm-token', protect, updateFcmToken);
router.get('/notifications', protect, getNotifications);
router.put('/notifications/:notificationId/read', protect, markNotificationRead);
router.post('/interview/document', protect, upload.single('document'), uploadInterviewDocument);

// Remedy Management
router.get('/remedies/my', protect, getMyRemedies);
router.get('/remedy/:remedyId', protect, getMyRemedyById);
router.put('/remedy/:remedyId', protect, upload.single('image'), updateRemedy);
router.delete('/remedy/:remedyId', protect, deleteRemedy);
router.post('/remedy', protect, upload.single('image'), createRemedy);
router.post('/remedy/:remedyId/publish', protect, publishRemedy);
router.post('/remedy/:remedyId/unpublish', protect, unpublishRemedy);
router.post('/course', protect, upload.single('thumbnail'), addCourse);
router.get('/courses', protect, getMyCourses);
router.get('/course/:courseId', protect, getMyCourseById);
router.post('/course/:courseId/publish', protect, publishCourse);
router.post('/course/:courseId/unpublish', protect, unpublishCourse);
router.delete('/course/:courseId', protect, deleteCourse);
router.post('/course/:courseId/module', protect, addCourseModule);
router.post('/course/:courseId/module/:moduleId/content', protect, courseContentUpload.single('file'), addModuleContent);
router.post('/course/:courseId/live/start', protect, startCourseMasterclass);
router.get('/course/:courseId/live', protect, getAstrologerCourseLive);

// Training & Resources Features
router.get('/resources', protect, getResources);
router.get('/training/modules', protect, getTrainingModules);
router.post('/training/progress', protect, updateTrainingProgress);
router.post('/training/masterclass/register', protect, registerMasterclass);
router.post('/training/assignment/submit', protect, upload.single('file'), submitTrainingAssignment);

export default router;
