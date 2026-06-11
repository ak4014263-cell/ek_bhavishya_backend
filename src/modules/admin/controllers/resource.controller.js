import Resource from '../../../models/Resource.js';

export const getResources = async (req, res) => {
    try {
        const resources = await Resource.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: resources });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

export const createResource = async (req, res) => {
    try {
        const { title, description, type, url, thumbnail, category } = req.body;
        
        let fileUrl = url;
        let thumbUrl = thumbnail;

        if (req.files) {
            if (req.files.file && req.files.file.length > 0) {
                fileUrl = \\://\/uploads/\\;
            }
            if (req.files.thumbnail && req.files.thumbnail.length > 0) {
                thumbUrl = \\://\/uploads/\\;
            }
        }

        const resource = await Resource.create({
            title, description, type: type || 'document', url: fileUrl, thumbnail: thumbUrl, category
        });
        res.status(201).json({ success: true, data: resource });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

export const updateResource = async (req, res) => {
    try {
        const resource = await Resource.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json({ success: true, data: resource });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

export const deleteResource = async (req, res) => {
    try {
        await Resource.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: 'Resource deleted' });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
