import mongoose from 'mongoose';
import User from '../models/User.js';
import Order from '../models/Order.js';
import { normalizeMediaPath } from './astrologerLink.js';

/** True if user purchased / is enrolled in the course */
export const userIsEnrolledInCourse = async (userId, courseId) => {
    if (!userId || !courseId) return false;
    const cid = courseId.toString();

    const user = await User.findById(userId).select('enrolledCourses').lean();
    if (user?.enrolledCourses?.some((id) => id?.toString() === cid)) {
        return true;
    }

    const paidOrder = await Order.findOne({
        userId,
        status: { $nin: ['cancelled'] },
        paymentStatus: { $in: ['paid', 'completed', 'success'] },
        items: {
            $elemMatch: {
                itemType: 'Course',
                courseId: new mongoose.Types.ObjectId(cid),
            },
        },
    }).lean();

    if (paidOrder) return true;

    const anyOrder = await Order.findOne({
        userId,
        status: { $nin: ['cancelled'] },
        items: {
            $elemMatch: {
                itemType: 'Course',
                courseId: new mongoose.Types.ObjectId(cid),
            },
        },
    }).lean();

    return !!anyOrder;
};

const mapMediaList = (items, courseId, enrolled) => {
    if (!enrolled) return [];
    return (items || []).map((item) => {
        const raw = item?.url || '';
        const normalized = normalizeMediaPath(raw) || raw;
        const isUpload = normalized.startsWith('/uploads/');
        return {
            ...item,
            url: normalized,
            accessUrl: isUpload
                ? `/api/user/courses/${courseId}/asset?path=${encodeURIComponent(normalized)}`
                : normalized,
        };
    });
};

/** Module list for catalog / locked preview (no media URLs) */
export const stripModulesForPreview = (modules = []) =>
    modules.map((m, index) => ({
        _id: m._id,
        title: m.title,
        description: m.description,
        order: m.order ?? index,
        locked: true,
        videoCount: (m.videos || []).length,
        documentCount: (m.documents || []).length,
        imageCount: (m.images || []).length,
        videos: [],
        documents: [],
        images: [],
    }));

/** Full modules with resolved URLs for enrolled learners */
export const normalizeModulesForEnrolled = (modules = [], courseId) =>
    (modules || []).map((m, index) => ({
        _id: m._id,
        title: m.title,
        description: m.description,
        order: m.order ?? index,
        locked: false,
        videos: mapMediaList(m.videos, courseId, true),
        documents: mapMediaList(m.documents, courseId, true),
        images: mapMediaList(m.images, courseId, true),
    }));

/** Collect all upload paths referenced by a course (for asset authorization) */
export const collectCourseUploadPaths = (modules = []) => {
    const paths = new Set();
    const add = (url) => {
        const n = normalizeMediaPath(url);
        if (n && n.startsWith('/uploads/')) paths.add(n);
    };
    for (const mod of modules || []) {
        for (const v of mod.videos || []) add(v.url);
        for (const d of mod.documents || []) add(d.url);
        for (const img of mod.images || []) add(img.url);
    }
    return paths;
};
