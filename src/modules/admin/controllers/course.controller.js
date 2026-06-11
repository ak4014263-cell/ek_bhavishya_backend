import Course from '../../../models/Course.js';
import AdminCourse from '../models/adminCourse.model.js';

const getCourseById = async (req, res) => {
    try {
        const { id } = req.params;

        // Try AdminCourse first, then Course (astrologer)
        let course = await AdminCourse.findById(id).populate('createdByAdmin', 'name email');
        if (!course) {
            course = await Course.findById(id).populate({
                path: 'astrologerId',
                select: 'personalDetails userId',
                populate: { path: 'userId', select: 'fullName email' }
            });
        }

        if (!course) {
            return res.status(404).json({ success: false, message: 'Course not found.' });
        }

        res.status(200).json({ success: true, course });
    } catch (error) {
        console.error('Get Course By ID Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

const approveCourse = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || id.trim() === '') {
            return res.status(400).json({ 
                success: false, 
                message: 'Course ID is required' 
            });
        }

        console.log('Approving course with ID:', id);

        // Try AdminCourse first
        let course = await AdminCourse.findById(id);

        if (!course) {
            // Try Course (astrologer)
            course = await Course.findById(id);
        }

        if (!course) {
            return res.status(404).json({ 
                success: false, 
                message: 'Course not found.' 
            });
        }

        // Update status and clear rejection reason
        course.status = 'Approved';
        course.rejectionReason = null;

        // Save with validation
        await course.save();

        console.log('Course approved successfully:', id);

        // Populate based on course type
        if (course.createdByAdmin) {
            await course.populate('createdByAdmin', 'name email');
        } else if (course.astrologerId) {
            await course.populate({
                path: 'astrologerId',
                select: 'personalDetails userId',
                populate: { path: 'userId', select: 'fullName' }
            });
        }

        res.status(200).json({
            success: true,
            message: 'Course approved successfully.',
            course,
        });
    } catch (error) {
        console.error('Approve Course Error:', error);
        
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({ 
                success: false, 
                message: 'Validation error', 
                details: messages 
            });
        }

        res.status(500).json({ 
            success: false, 
            message: 'Internal Server Error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const rejectCourse = async (req, res) => {
    try {
        const { id } = req.params;
        const { rejectionReason } = req.body;

        if (!id || id.trim() === '') {
            return res.status(400).json({ 
                success: false, 
                message: 'Course ID is required' 
            });
        }

        console.log('Rejecting course with ID:', id);

        // Try AdminCourse first
        let course = await AdminCourse.findById(id);

        if (!course) {
            // Try Course (astrologer)
            course = await Course.findById(id);
        }

        if (!course) {
            return res.status(404).json({ 
                success: false, 
                message: 'Course not found.' 
            });
        }

        // Update status and rejection reason
        course.status = 'Rejected';
        
        if (rejectionReason && rejectionReason.trim() !== '') {
            course.rejectionReason = rejectionReason.trim();
        } else {
            course.rejectionReason = 'No reason provided';
        }

        // Save with validation
        await course.save();

        console.log('Course rejected successfully:', id);

        // Populate based on course type
        if (course.createdByAdmin) {
            await course.populate('createdByAdmin', 'name email');
        } else if (course.astrologerId) {
            await course.populate({
                path: 'astrologerId',
                select: 'personalDetails userId',
                populate: { path: 'userId', select: 'fullName' }
            });
        }

        res.status(200).json({
            success: true,
            message: 'Course rejected successfully.',
            course,
        });
    } catch (error) {
        console.error('Reject Course Error:', error);
        
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({ 
                success: false, 
                message: 'Validation error', 
                details: messages 
            });
        }

        res.status(500).json({ 
            success: false, 
            message: 'Internal Server Error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const revertCourse = async (req, res) => {
    try {
        const { id } = req.params;

        // Try AdminCourse first, then Course (astrologer)
        let course = await AdminCourse.findById(id);
        let isAdminCourse = true;

        if (!course) {
            course = await Course.findById(id);
            isAdminCourse = false;
        }

        if (!course) {
            return res.status(404).json({ success: false, message: 'Course not found.' });
        }

        if (course.status === 'Pending') {
            return res.status(400).json({
                success: false,
                message: 'Course status is already Pending.',
            });
        }

        course.status = 'Pending';
        course.rejectionReason = null;
        await course.save();

        // Populate based on course type
        if (isAdminCourse) {
            await course.populate('createdByAdmin', 'name email');
        } else {
            await course.populate({
                path: 'astrologerId',
                select: 'personalDetails userId',
                populate: { path: 'userId', select: 'fullName' }
            });
        }

        res.status(200).json({
            success: true,
            message: 'Course status reverted to Pending successfully.',
            course,
        });
    } catch (error) {
        console.error('Revert Course Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

const createAdminCourse = async (req, res) => {
    try {
        const adminId = req.admin?.id;
        if (!adminId) return res.status(401).json({ success: false, message: 'Unauthorized - Admin authentication required' });

        const {
            title,
            description,
            instructor,
            price,
            isFree,
            level,
            thumbnail,
            category,
            tags,
            courseType,
            isFeatured,
        } = req.body;

        if (!title || title.trim() === '') {
            return res.status(400).json({ success: false, message: 'Title is required' });
        }
        if (!description || description.trim() === '') {
            return res.status(400).json({ success: false, message: 'Description is required' });
        }
        if (!instructor || instructor.trim() === '') {
            return res.status(400).json({ success: false, message: 'Instructor name is required' });
        }

        const adminCourse = new AdminCourse({
            title: title.trim(),
            description: description.trim(),
            instructor: instructor.trim(),
            price: isFree ? 0 : (price || 0),
            isFree: isFree || false,
            level: level || 'Beginner',
            thumbnail: thumbnail || '',
            category: category || 'General',
            tags: Array.isArray(tags) ? tags : [],
            courseType: courseType || 'recorded',
            isFeatured: isFeatured || false,
            modules: [],
            createdByAdmin: adminId,
            status: 'Approved',
        });

        const savedCourse = await adminCourse.save();

        res.status(201).json({
            success: true,
            message: 'Admin course created successfully.',
            course: savedCourse,
        });
    } catch (error) {
        console.error('Create Admin Course Error:', error);

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({ success: false, message: 'Validation error', details: messages });
        }

        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

const getAdminCourses = async (req, res) => {
    try {
        const { status, search } = req.query;
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
        const skip = (page - 1) * limit;

        const filter = {};
        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { instructor: { $regex: search, $options: 'i' } },
            ];
        }
        if (status) {
            filter.status = status;
        }

        // Fetch from BOTH collections (AdminCourse and Course (astrologer))
        const [adminCoursesRaw, astrologerCoursesRaw] = await Promise.all([
            AdminCourse.find(filter)
                .populate('createdByAdmin', 'name email')
                .sort({ createdAt: -1 })
                .lean(),
            Course.find(filter)
                .populate({
                    path: 'astrologerId',
                    select: 'personalDetails userId',
                    populate: { path: 'userId', select: 'fullName' }
                })
                .sort({ createdAt: -1 })
                .lean()
        ]);

        // Map AdminCourses
        const adminCourses = adminCoursesRaw.map(course => ({
            ...course,
            source: 'Admin',
            category: course.category || 'General',
            level: course.level || 'Beginner',
            instructor: course.instructor || 'Admin',
            price: course.price || 0,
            status: course.status || 'Approved'
        }));

        // Map AstrologerCourses
        const astrologerCourses = astrologerCoursesRaw.map(course => {
            const personalName = course.astrologerId?.personalDetails?.name;
            const pseudonym = course.astrologerId?.personalDetails?.pseudonym;
            const userFullName = course.astrologerId?.userId?.fullName;
            const nameResolved = personalName || pseudonym || userFullName || course.instructor || 'Astrologer';
            return {
                ...course,
                source: 'Astrologer',
                category: course.category || 'General',
                level: course.level || 'Beginner',
                instructor: nameResolved,
                price: course.price || 0,
                status: course.status || 'Draft'
            };
        });

        // Combine and sort by latest
        const combined = [...adminCourses, ...astrologerCourses];
        combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const total = combined.length;
        const paginatedData = combined.slice(skip, skip + limit);

        res.status(200).json({
            success: true,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
            data: paginatedData,
        });
    } catch (error) {
        console.error('Get Admin Courses Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

const updateAdminCourse = async (req, res) => {
    try {
        const adminId = req.admin?.id;
        if (!adminId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const { id } = req.params;
        const { title, description, instructor, price, isFree, level, thumbnail, status, modules, category, tags, isFeatured, courseType } = req.body;

        const course = await AdminCourse.findById(id);
        if (!course) {
            return res.status(404).json({ success: false, message: 'Admin course not found.' });
        }

        // Update all allowed fields
        if (title !== undefined) course.title = title.trim();
        if (description !== undefined) course.description = description.trim();
        if (instructor !== undefined) course.instructor = instructor.trim();
        if (isFree !== undefined) {
            course.isFree = isFree;
            if (isFree) course.price = 0;
        }
        if (price !== undefined && !course.isFree) course.price = price;
        if (level !== undefined) course.level = level;
        if (thumbnail !== undefined) course.thumbnail = thumbnail;
        
        // Handle status - convert "Active" to "Approved" for backward compatibility
        if (status !== undefined) {
            const validStatus = status === 'Active' ? 'Approved' : status;
            course.status = validStatus;
        }
        
        if (modules !== undefined && Array.isArray(modules)) course.modules = modules;
        if (category !== undefined) course.category = category;
        if (tags !== undefined && Array.isArray(tags)) course.tags = tags;
        if (isFeatured !== undefined) course.isFeatured = isFeatured;
        if (courseType !== undefined) course.courseType = courseType;

        const updatedCourse = await course.save();

        res.status(200).json({
            success: true,
            message: 'Admin course updated successfully.',
            course: updatedCourse,
        });
    } catch (error) {
        console.error('Update Admin Course Error:', error);

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({ success: false, message: 'Validation error', details: messages });
        }

        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

const deleteAdminCourse = async (req, res) => {
    try {
        const adminId = req.admin?.id;
        if (!adminId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const { id } = req.params;

        // Try to delete from AdminCourse first
        let course = await AdminCourse.findByIdAndDelete(id);
        let courseType = 'Admin';

        // If not found in AdminCourse, try Course (Astrologer)
        if (!course) {
            course = await Course.findByIdAndDelete(id);
            courseType = 'Astrologer';
        }

        if (!course) {
            return res.status(404).json({ success: false, message: 'Course not found.' });
        }

        res.status(200).json({
            success: true,
            message: `${courseType} course deleted successfully.`,
            deletedCourse: {
                id: course._id,
                title: course.title,
                type: courseType,
            },
        });
    } catch (error) {
        console.error('Delete Course Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

const getUnifiedCourses = async (req, res) => {
    try {
        const { search } = req.query;
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
        const skip = (page - 1) * limit;

        const filter = {};
        if (search) {
            filter.title = { $regex: search, $options: 'i' };
        }

        // Fetch from BOTH collections (AdminCourse and Course (Astrologer)) - ALL courses
        const [adminCourses, astrologerCourses] = await Promise.all([
            AdminCourse.find(filter)
                .select('_id title thumbnail category level instructor price status createdAt')
                .lean(),
            Course.find(filter)
                .select('_id title astrologerId price status createdAt')
                .populate({
                    path: 'astrologerId',
                    select: 'personalDetails userId',
                    populate: { path: 'userId', select: 'fullName' }
                })
                .lean(),
        ]);

        // Map to simplified format and combine ALL courses
        const allCourses = [
            ...adminCourses.map(c => ({
                _id: c._id,
                title: c.title,
                name: c.title,
                thumbnail: c.thumbnail || null,
                source: 'Admin',
                category: c.category || 'General',
                level: c.level || 'Beginner',
                instructor: c.instructor || 'Admin',
                price: c.price || 0,
                status: c.status || 'Approved',
                createdAt: c.createdAt
            })),
            ...astrologerCourses.map(c => {
                const personalName = c.astrologerId?.personalDetails?.name;
                const pseudonym = c.astrologerId?.personalDetails?.pseudonym;
                const userFullName = c.astrologerId?.userId?.fullName;
                const nameResolved = personalName || pseudonym || userFullName || 'Astrologer';
                return {
                    _id: c._id,
                    title: c.title,
                    name: c.title,
                    thumbnail: c.astrologerId?.personalDetails?.profileImage || null,
                    source: 'Astrologer',
                    category: 'General',
                    level: 'Beginner',
                    instructor: nameResolved,
                    price: c.price || 0,
                    status: c.status || 'Approved',
                    createdAt: c.createdAt
                };
            }),
        ];

        // Sort by latest
        allCourses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const total = allCourses.length;
        const totalAdminCourses = adminCourses.length;
        const totalAstrologerCourses = astrologerCourses.length;
        const paginatedData = allCourses.slice(skip, skip + limit);

        res.status(200).json({
            success: true,
            totalAdminCourses,
            totalAstrologerCourses,
            total,
            data: paginatedData,
        });
    } catch (error) {
        console.error('Get Unified Courses Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

const getCourseModules = async (req, res) => {
    try {
        const { id } = req.params;

        // Try AdminCourse first, then Course
        let course = await AdminCourse.findById(id).select('modules').lean();
        if (!course) {
            course = await Course.findById(id).select('modules').lean();
        }

        if (!course) {
            return res.status(404).json({ success: false, message: 'Course not found' });
        }

        res.status(200).json({
            success: true,
            data: course.modules || [],
        });
    } catch (error) {
        console.error('Get Course Modules Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

const courseController = {
    getCourseById,
    approveCourse,
    rejectCourse,
    revertCourse,
    createAdminCourse,
    getAdminCourses,
    updateAdminCourse,
    deleteAdminCourse,
    getUnifiedCourses,
    getCourseModules,
};

export default courseController;
