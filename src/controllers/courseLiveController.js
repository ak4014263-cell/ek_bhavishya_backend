import LiveSession from '../models/LiveSession.js';
import Course from '../models/Course.js';
import { resolveAstrologerForUser } from '../utils/astrologerLink.js';
import { userIsEnrolledInCourse } from '../utils/courseAccess.js';

const resolveAstrologerId = async (req) => {
    const astrologer = await resolveAstrologerForUser(req.user);
    return astrologer?._id ?? null;
};

const formatLiveSession = (session) => {
    if (!session) return null;
    const obj = session.toObject ? session.toObject() : session;
    return {
        ...obj,
        id: obj._id?.toString(),
        topic: obj.category,
    };
};

/** End active lives for astrologer (optionally only for one course) */
const endActiveSessionsForAstrologer = async (astrologerId, courseId = null) => {
    const filter = { astrologerId, status: 'active' };
    if (courseId) filter.courseId = courseId;

    const active = await LiveSession.find(filter);
    const now = new Date();
    await LiveSession.updateMany(filter, { status: 'ended', endTime: now });

    const courseIds = [...new Set(active.map((s) => s.courseId?.toString()).filter(Boolean))];
    if (courseIds.length) {
        await Course.updateMany(
            { _id: { $in: courseIds } },
            { $unset: { activeLiveSessionId: 1 } }
        );
    }
};

/** POST /api/astrologer/course/:courseId/live/start */
export const startCourseMasterclass = async (req, res) => {
    try {
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        const { courseId } = req.params;
        const { title } = req.body;

        const course = await Course.findOne({
            _id: courseId,
            astrologerId: astrologer._id,
        });
        if (!course) {
            return res.status(404).json({ success: false, message: 'Course not found' });
        }
        if (course.duration === 'Service') {
            return res.status(400).json({
                success: false,
                message: 'Live masterclass is only available for learning courses, not service listings',
            });
        }

        await endActiveSessionsForAstrologer(astrologer._id);

        const sessionTitle =
            (title && String(title).trim()) ||
            `${course.title} — Live Masterclass`;

        const newSession = await LiveSession.create({
            astrologerId: astrologer._id,
            courseId: course._id,
            sessionType: 'masterclass',
            title: sessionTitle,
            category: course.category || 'Course',
            status: 'active',
        });

        course.activeLiveSessionId = newSession._id;
        await course.save();

        res.status(201).json({
            success: true,
            data: formatLiveSession(newSession),
            course: {
                _id: course._id,
                title: course.title,
                status: course.status,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** GET /api/astrologer/course/:courseId/live */
export const getAstrologerCourseLive = async (req, res) => {
    try {
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        const course = await Course.findOne({
            _id: req.params.courseId,
            astrologerId: astrologer._id,
        }).lean();
        if (!course) {
            return res.status(404).json({ success: false, message: 'Course not found' });
        }

        let session = null;
        if (course.activeLiveSessionId) {
            session = await LiveSession.findOne({
                _id: course.activeLiveSessionId,
                status: 'active',
            }).lean();
        }
        if (!session) {
            session = await LiveSession.findOne({
                courseId: course._id,
                astrologerId: astrologer._id,
                status: 'active',
            })
                .sort({ startTime: -1 })
                .lean();
        }

        res.status(200).json({
            success: true,
            isLive: !!session,
            data: session ? formatLiveSession(session) : null,
            course: { _id: course._id, title: course.title, status: course.status },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** GET /api/user/courses/:courseId/live */
export const getUserCourseLive = async (req, res) => {
    try {
        const course = await Course.findById(req.params.courseId)
            .populate('astrologerId', 'personalDetails ratings userId')
            .lean();
        if (!course || course.status !== 'Published') {
            return res.status(404).json({ success: false, message: 'Course not found' });
        }

        const session = await LiveSession.findOne({
            courseId: course._id,
            status: 'active',
            sessionType: 'masterclass',
        })
            .populate('astrologerId', 'personalDetails ratings')
            .lean();

        if (!session) {
            return res.status(200).json({
                success: true,
                isLive: false,
                data: null,
            });
        }

        let canJoin = false;
        if (req.user) {
            const astro = course.astrologerId;
            const hostUserId =
                astro && typeof astro === 'object' ? astro.userId?.toString() : null;
            if (hostUserId && req.user._id.toString() === hostUserId) {
                canJoin = true;
            } else {
                canJoin = await userIsEnrolledInCourse(req.user._id, course._id);
            }
        }

        res.status(200).json({
            success: true,
            isLive: true,
            canJoin,
            enrolled: canJoin,
            data: formatLiveSession(session),
            course: {
                _id: course._id,
                title: course.title,
                thumbnail: course.thumbnail,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export { endActiveSessionsForAstrologer, resolveAstrologerId };
