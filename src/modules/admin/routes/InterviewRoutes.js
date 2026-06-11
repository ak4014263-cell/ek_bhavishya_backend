import express from 'express';
import { 
    scheduleMeeting, 
    rescheduleMeeting, 
    markInterviewCompleted, 
    rejectAstrologer,
    getAstrologersByStatus 
} from "../controllers/interviewController.js"

const router = express.Router();

router.get('/', getAstrologersByStatus);
router.post('/schedule', scheduleMeeting);
router.put('/schedule', scheduleMeeting);
router.post('/reschedule', rescheduleMeeting);
router.put('/reschedule', rescheduleMeeting);
router.post('/complete', markInterviewCompleted);
router.put('/complete', markInterviewCompleted);
router.post('/reject', rejectAstrologer);
router.put('/reject', rejectAstrologer);

export default router;