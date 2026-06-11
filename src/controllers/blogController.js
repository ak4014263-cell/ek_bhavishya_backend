import Blog from '../models/Blog.js';
import Astrologer from '../models/Astrologer.js';
import { resolveAstrologerForUser, normalizeMediaPath } from '../utils/astrologerLink.js';

export const getAllBlogs = async (req, res) => {
    try {
        const blogs = await Blog.find({ isPublished: true })
            .populate('astrologerId', 'personalDetails.name')
            .sort({ createdAt: -1 });

        // Patch broken placeholder URLs and normalize image paths
        const patchedBlogs = blogs.map(blog => {
            const b = blog.toObject();
            const raw = b.imageUrl || b.image;
            if (raw && raw.includes('via.placeholder.com')) {
                b.imageUrl = 'https://picsum.photos/800/400';
            } else {
                b.imageUrl = normalizeMediaPath(raw) || b.imageUrl;
            }
            b.image = b.imageUrl;
            return b;
        });
        
        // Fallback for demo if empty
        if (patchedBlogs.length === 0) {
            return res.status(200).json({ 
                success: true, 
                data: [
                    {
                        _id: 'blog_1',
                        title: 'Understanding Mercury Retrograde',
                        content: 'Mercury retrograde is a period that happens three to four times a year...',
                        category: 'Planetary',
                        imageUrl: 'https://picsum.photos/800/400?sig=10',
                        createdAt: new Date()
                    },
                    {
                        _id: 'blog_2',
                        title: 'The Power of Gemstones',
                        content: 'Gemstones have been used for centuries to balance planetary energies...',
                        category: 'Remedies',
                        imageUrl: 'https://picsum.photos/800/400?sig=11',
                        createdAt: new Date()
                    }
                ] 
            });
        }
        
        res.status(200).json({ success: true, data: patchedBlogs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getBlogById = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id).populate('astrologerId', 'personalDetails.name');
        if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });
        
        // Patch broken placeholder URLs on the fly
        const b = blog.toObject();
        if (b.imageUrl && b.imageUrl.includes('via.placeholder.com')) {
            b.imageUrl = 'https://picsum.photos/800/400';
        }

        // Increment views
        blog.views += 1;
        await blog.save();
        
        res.status(200).json({ success: true, data: b });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createBlog = async (req, res) => {
    try {
        const { title, content, category, tags, summary, slug, isPublished } = req.body;
        const astrologer = await resolveAstrologerForUser(req.user);
        
        let imageUrl = req.body.imageUrl;
        if (req.file) {
            imageUrl = `/uploads/${req.file.filename}`;
        }
        imageUrl = normalizeMediaPath(imageUrl);

        const published =
            isPublished === undefined || isPublished === null || isPublished === ''
                ? true
                : isPublished === true || isPublished === 'true';

        const blog = await Blog.create({
            title,
            slug: slug || title.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, ''),
            summary,
            content,
            category,
            tags: typeof tags === 'string' ? JSON.parse(tags) : tags,
            imageUrl,
            image: imageUrl,
            authorId: req.user._id,
            astrologerId: astrologer?._id,
            isPublished: published,
        });
        
        res.status(201).json({ success: true, data: blog });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getMyBlogs = async (req, res) => {
    try {
        const astrologer = await resolveAstrologerForUser(req.user);
        const query = astrologer
            ? { $or: [{ authorId: req.user._id }, { astrologerId: astrologer._id }] }
            : { authorId: req.user._id };
        const blogs = await Blog.find(query).sort({ createdAt: -1 });
        
        const patchedBlogs = blogs.map(blog => {
            const b = blog.toObject();
            const raw = b.imageUrl || b.image;
            if (raw && raw.includes('via.placeholder.com')) {
                b.imageUrl = 'https://picsum.photos/800/400';
            } else {
                b.imageUrl = normalizeMediaPath(raw) || b.imageUrl;
            }
            b.image = b.imageUrl;
            return b;
        });

        res.status(200).json({ success: true, data: patchedBlogs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateBlog = async (req, res) => {
    try {
        const { title, content, category, tags, summary, isPublished } = req.body;
        const astrologer = await resolveAstrologerForUser(req.user);
        const ownershipQuery = astrologer
            ? { $or: [{ authorId: req.user._id }, { astrologerId: astrologer._id }] }
            : { authorId: req.user._id };
        const blog = await Blog.findOne({ _id: req.params.id, ...ownershipQuery });
        
        if (!blog) return res.status(404).json({ success: false, message: 'Blog not found or unauthorized' });

        if (title) {
            blog.title = title;
            blog.slug = title.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
        }
        if (content) blog.content = content;
        if (category) blog.category = category;
        if (summary) blog.summary = summary;
        if (isPublished !== undefined) blog.isPublished = isPublished;
        if (tags) blog.tags = typeof tags === 'string' ? JSON.parse(tags) : tags;
        
        if (req.file) {
            blog.imageUrl = normalizeMediaPath(`/uploads/${req.file.filename}`);
            blog.image = blog.imageUrl;
        } else if (req.body.imageUrl) {
            blog.imageUrl = normalizeMediaPath(req.body.imageUrl);
            blog.image = blog.imageUrl;
        }

        await blog.save();
        res.status(200).json({ success: true, data: blog });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteBlog = async (req, res) => {
    try {
        const astrologer = await resolveAstrologerForUser(req.user);
        const ownershipQuery = astrologer
            ? { $or: [{ authorId: req.user._id }, { astrologerId: astrologer._id }] }
            : { authorId: req.user._id };
        const blog = await Blog.findOneAndDelete({ _id: req.params.id, ...ownershipQuery });
        if (!blog) return res.status(404).json({ success: false, message: 'Blog not found or unauthorized' });
        
        res.status(200).json({ success: true, message: 'Blog deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
