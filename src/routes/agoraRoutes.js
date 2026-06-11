import express from 'express';
const router = express.Router();

import { generateRtcToken, generateRtmToken } from '../controllers/agoraController.js';
import { protect } from '../middleware/auth.js';

// Route to generate RTC Token (Video/Audio)
router.post('/rtc-token', protect, generateRtcToken);

// Route to generate RTM Token (Signaling/Chat)
router.post('/rtm-token', protect, generateRtmToken);

export default router;
