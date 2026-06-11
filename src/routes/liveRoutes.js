import express from 'express';
import { 
    startLiveSession, 
    endLiveSession, 
    getActiveLiveSessions, 
    joinLiveSession,
    getLiveSessionDetails,
    likeLiveSession
} from '../controllers/liveController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Public/User Routes
router.get('/active', getActiveLiveSessions);
router.get('/session/:sessionId', getLiveSessionDetails);
router.post('/:sessionId/join', protect, joinLiveSession);
router.post('/:sessionId/like', protect, likeLiveSession);

// Astrologer Routes
router.post('/start', protect, startLiveSession);
router.post('/:sessionId/end', protect, endLiveSession);

export default router;
