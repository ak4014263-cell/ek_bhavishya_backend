import TrainingModule from '../models/TrainingModule.js';
import { normalizeMediaPath } from '../utils/astrologerLink.js';

const parseJsonField = (val, fallback = []) => {
    if (val == null || val === '') return fallback;
    if (Array.isArray(val)) return val;
    if (typeof val === 'object') return val;
    try {
        return JSON.parse(val);
    } catch {
        return fallback;
    }
};

const normalizeModuleDoc = (doc) => {
    const obj = doc?.toObject ? doc.toObject() : { ...doc };
    if (obj.thumbnail) obj.thumbnail = normalizeMediaPath(obj.thumbnail);
    if (obj.videoUrl) obj.videoUrl = normalizeMediaPath(obj.videoUrl);
    obj.resources = (obj.resources || []).map((r) => ({
        ...r,
        url: normalizeMediaPath(r.url),
    }));
    obj.certifications = (obj.certifications || []).map((c) => ({
        ...c,
        url: normalizeMediaPath(c.url),
        imageUrl: normalizeMediaPath(c.imageUrl),
    }));
    return obj;
};

const buildPayload = (body, files) => {
    const payload = {
        title: body.title,
        description: body.description,
        duration: body.duration,
        category: body.category || 'General',
        videoUrl: body.videoUrl,
        thumbnail: body.thumbnail,
        hasAssignment: body.hasAssignment === true || body.hasAssignment === 'true',
        assignmentTitle: body.assignmentTitle,
        assignmentDesc: body.assignmentDesc,
        dueDate: body.dueDate,
        isPublished: body.isPublished !== false && body.isPublished !== 'false',
        resources: parseJsonField(body.resources, []),
        certifications: parseJsonField(body.certifications, []),
    };

    if (body.sortOrder != null && body.sortOrder !== '') {
        payload.sortOrder = Number(body.sortOrder) || 0;
    }

    if (files?.thumbnail?.[0]) {
        payload.thumbnail = `/uploads/${files.thumbnail[0].filename}`;
    }
    if (files?.video?.[0]) {
        payload.videoUrl = `/uploads/${files.video[0].filename}`;
    }

    return payload;
};

export const listTrainingModules = async (req, res) => {
    try {
        const modules = await TrainingModule.find().sort({ sortOrder: 1, createdAt: -1 });
        res.json({
            success: true,
            data: modules.map(normalizeModuleDoc),
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

export const createTrainingModule = async (req, res) => {
    try {
        const payload = buildPayload(req.body, req.files);
        if (!payload.title?.trim()) {
            return res.status(400).json({ success: false, message: 'Title is required' });
        }
        const trModule = await TrainingModule.create(payload);
        res.status(201).json({ success: true, data: normalizeModuleDoc(trModule) });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

export const updateTrainingModule = async (req, res) => {
    try {
        const payload = buildPayload(req.body, req.files);
        if (payload.title === '') {
            return res.status(400).json({ success: false, message: 'Title cannot be empty' });
        }
        const trModule = await TrainingModule.findByIdAndUpdate(req.params.id, payload, {
            new: true,
            runValidators: true,
        });
        if (!trModule) {
            return res.status(404).json({ success: false, message: 'Training module not found' });
        }
        res.json({ success: true, data: normalizeModuleDoc(trModule) });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

export const deleteTrainingModule = async (req, res) => {
    try {
        const trModule = await TrainingModule.findByIdAndDelete(req.params.id);
        if (!trModule) {
            return res.status(404).json({ success: false, message: 'Training module not found' });
        }
        res.json({ success: true, message: 'Training module deleted' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};
