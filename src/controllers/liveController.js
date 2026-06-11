import LiveSession from '../models/LiveSession.js';
import Course from '../models/Course.js';
import { resolveAstrologerForUser } from '../utils/astrologerLink.js';
import { userIsEnrolledInCourse } from '../utils/courseAccess.js';
import { endActiveSessionsForAstrologer } from './courseLiveController.js';

const getAstrologerDoc = async (req) => resolveAstrologerForUser(req.user);

export const startLiveSession = async (req, res) => {
    try {
        const astrologer = await getAstrologerDoc(req);
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        const { title, category, topic } = req.body;

        await endActiveSessionsForAstrologer(astrologer._id);

        const newSession = await LiveSession.create({
            astrologerId: astrologer._id,
            sessionType: 'public',
            title: title || 'Live Session',
            category: category || topic || 'General',
            status: 'active',
        });

        res.status(201).json({
            success: true,
            data: newSession,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const endLiveSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const astrologer = await getAstrologerDoc(req);

        const session = await LiveSession.findById(sessionId);
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }

        if (astrologer && session.astrologerId.toString() !== astrologer._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to end this session' });
        }

        session.status = 'ended';
        session.endTime = new Date();
        await session.save();

        if (session.courseId) {
            await Course.updateOne(
                { _id: session.courseId },
                { $unset: { activeLiveSessionId: 1 } }
            );
        }

        res.status(200).json({
            success: true,
            data: session,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getActiveLiveSessions = async (req, res) => {
    try {
        const sessions = await LiveSession.find({ status: 'active' })
            .populate('astrologerId', 'personalDetails ratings')
            .populate('courseId', 'title thumbnail')
            .sort({ startTime: -1 });

        res.status(200).json({
            success: true,
            data: sessions,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const joinLiveSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user._id;

        const session = await LiveSession.findById(sessionId);
        if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

        if (session.status !== 'active') {
            return res.status(400).json({ success: false, message: 'This live session has ended' });
        }

        if (session.sessionType === 'masterclass' && session.courseId) {
            const astrologer = await resolveAstrologerForUser(req.user);
            const isHost =
                astrologer &&
                session.astrologerId.toString() === astrologer._id.toString();
            if (!isHost) {
                const enrolled = await userIsEnrolledInCourse(userId, session.courseId);
                if (!enrolled) {
                    return res.status(403).json({
                        success: false,
                        message: 'Enroll in this course to join the live masterclass',
                    });
                }
            }
        }

        const isNewViewer = !session.viewers.some((v) => v.toString() === userId.toString());

        const updatedSession = await LiveSession.findByIdAndUpdate(
            sessionId,
            {
                $addToSet: { viewers: userId },
                $inc: { currentViewersCount: isNewViewer ? 1 : 0 },
            },
            { new: true }
        );

        if (updatedSession.currentViewersCount > updatedSession.maxViewers) {
            updatedSession.maxViewers = updatedSession.currentViewersCount;
            await updatedSession.save();
        }

        res.status(200).json({
            success: true,
            data: updatedSession,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const likeLiveSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user._id;

        const session = await LiveSession.findById(sessionId);
        if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

        const hasLiked = session.likedBy.some((id) => id.toString() === userId.toString());
        if (hasLiked) {
            return res.status(400).json({ success: false, message: 'Already liked' });
        }

        const updatedSession = await LiveSession.findByIdAndUpdate(
            sessionId,
            {
                $inc: { likes: 1 },
                $addToSet: { likedBy: userId },
            },
            { new: true }
        );

        res.status(200).json({
            success: true,
            data: updatedSession,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getLiveSessionDetails = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await LiveSession.findById(sessionId)
            .populate('astrologerId', 'personalDetails ratings')
            .populate('courseId', 'title thumbnail status');

        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }

        res.status(200).json({
            success: true,
            data: session,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
