import Banner from '../../../models/Banner.js';

export const getBanners = async (req, res) => {
    try {
        const banners = await Banner.find().sort({ order: 1 });
        res.status(200).json({ success: true, data: banners });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createBanner = async (req, res) => {
    try {
        const { title, target, icon, gradient } = req.body;
        const count = await Banner.countDocuments();
        const banner = new Banner({
            title,
            target,
            icon,
            gradient,
            image: req.file ? req.file.path : undefined,
            order: count + 1
        });
        await banner.save();
        res.status(201).json({ success: true, data: banner });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };
        if (req.file) {
            updateData.image = req.file.path;
        }
        const banner = await Banner.findByIdAndUpdate(id, updateData, { new: true });
        res.status(200).json({ success: true, data: banner });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const toggleBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const banner = await Banner.findById(id);
        if (!banner) return res.status(404).json({ success: false, message: 'Banner not found' });
        banner.active = !banner.active;
        await banner.save();
        res.status(200).json({ success: true, data: banner });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteBanner = async (req, res) => {
    try {
        const { id } = req.params;
        await Banner.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: 'Banner deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const reorderBanners = async (req, res) => {
    try {
        const { bannerIds } = req.body; // Array of IDs in new order
        const promises = bannerIds.map((id, index) => 
            Banner.findByIdAndUpdate(id, { order: index + 1 })
        );
        await Promise.all(promises);
        res.status(200).json({ success: true, message: 'Banners reordered' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export default {
    getBanners,
    createBanner,
    updateBanner,
    toggleBanner,
    deleteBanner,
    reorderBanners
};
