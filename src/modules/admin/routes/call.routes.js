import express from 'express';
import callController from '../controllers/call.controller.js';
import protectAdmin from '../middleware/protectAdmin.js';

const router = express.Router();

// Call monitoring dashboard routes
router.get('/calls/active', protectAdmin, callController.getActiveCalls);
router.get('/calls/statistics', protectAdmin, callController.getCallStatistics);
router.get('/calls/reported', protectAdmin, callController.getReportedCalls);

// Reported calls review routes
router.get('/calls/reported/:callId', protectAdmin, callController.getReportDetails);
router.post('/calls/reported/:callId/refund', protectAdmin, callController.refundReportedCall);
router.post('/calls/reported/:callId/dismiss', protectAdmin, callController.dismissReport);

// Astrologer suspension routes
router.post('/astrologers/:astrologerId/suspend-for-calls', protectAdmin, callController.suspendAstrologerForCallIssues);
router.post('/astrologers/:astrologerId/unsuspend', protectAdmin, callController.unsuspendAstrologer);
router.get('/astrologers/:astrologerId/suspension-history', protectAdmin, callController.getAstrologerSuspensionHistory);

export default router;
