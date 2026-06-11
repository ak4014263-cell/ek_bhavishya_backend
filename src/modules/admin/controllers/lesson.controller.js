import Lesson from '../models/lesson.model.js';
import AdminCourse from '../models/adminCourse.model.js';
import Course from '../../../models/Course.js';
import path from 'path';

const createLesson = async (req, res) => {
    try {
        const { courseId, courseType, moduleId, moduleName, title, description } = req.body;

        if (!courseId || !courseType || !title) {
            return res.status(400).json({
                success: false,
                message: 'courseId, courseType, and title are required'
            });
        }

        // If no module info is provided, use the lesson title as the module name
        const effectiveModuleName = moduleName || title;

        // 1. Validate course exists
        let course;
        if (courseType === 'AdminCourse') {
            course = await AdminCourse.findById(courseId);
        } else if (courseType === 'Course') {
            course = await Course.findById(courseId);
        } else {
            return res.status(400).json({ success: false, message: 'Invalid courseType' });
        }

        if (!course) {
            return res.status(404).json({ success: false, message: 'Course not found' });
        }

        // 2. Find or Create Module
        let targetModule;
        if (moduleId) {
            targetModule = course.modules.find(m => m._id.toString() === moduleId.toString());
        }

        if (!targetModule && effectiveModuleName) {
            targetModule = course.modules.find(m => m.title.toLowerCase() === effectiveModuleName.trim().toLowerCase());
        }

        // If it still doesn't exist, create it (Auto-Module Creation)
        if (!targetModule) {
            const nextModuleOrder = course.modules.length + 1;

            const newModule = {
                title: effectiveModuleName.trim(),
                order: nextModuleOrder
            };

            course.modules.push(newModule);
            await course.save();

            // Get the newly created module (it will be the last one)
            targetModule = course.modules[course.modules.length - 1];
        }

        const finalModuleId = targetModule._id;
        const finalModuleName = targetModule.title;

        // 3. Auto-calculate next lesson order within this module
        const lastLesson = await Lesson.findOne({ courseId, moduleId: finalModuleId })
            .sort({ order: -1 })
            .select('order')
            .lean();

        const nextOrder = lastLesson ? lastLesson.order + 1 : 1;

        // 4. Handle files
        const content = [];
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                let type = 'other';
                const ext = path.extname(file.originalname).toLowerCase();
                if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) type = 'image';
                else if (['.mp4', '.mov', '.avi'].includes(ext)) type = 'video';
                else if (['.pdf'].includes(ext)) type = 'pdf';
                else if (['.doc', '.docx'].includes(ext)) type = 'doc';

                content.push({
                    url: file.path.replace(/\\/g, '/'),
                    type
                });
            });
        }

        // 5. Create lesson
        const lesson = new Lesson({
            courseId,
            courseType,
            moduleId: finalModuleId,
            moduleName: finalModuleName,
            title,
            description,
            order: nextOrder,
            content
        });

        await lesson.save();

        res.status(201).json({
            success: true,
            message: 'Lesson created successfully',
            data: lesson
        });

    } catch (error) {
        console.error('Create Lesson Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

const getLessonById = async (req, res) => {
    try {
        const { id } = req.params;
        const lesson = await Lesson.findById(id);
        if (!lesson) {
            return res.status(404).json({ success: false, message: 'Lesson not found' });
        }
        res.status(200).json({ success: true, data: lesson });
    } catch (error) {
        console.error('Get Lesson By ID Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

const getLessonsByCourseAndModule = async (req, res) => {
    try {
        const { courseId, moduleId } = req.params;
        const lessons = await Lesson.find({ courseId, moduleId }).sort({ order: 1 });
        res.status(200).json({ success: true, data: lessons });
    } catch (error) {
        console.error('Get Lessons By Course and Module Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

const updateLesson = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, order, moduleId, moduleName } = req.body;

        const lesson = await Lesson.findById(id);
        if (!lesson) {
            return res.status(404).json({ success: false, message: 'Lesson not found' });
        }

        if (title) lesson.title = title;
        if (description) lesson.description = description;
        if (order !== undefined) lesson.order = Number(order);

        if (moduleId) {
            lesson.moduleId = moduleId;
            // Optionally update moduleName if we find it in the course
            const course = await (lesson.courseType === 'AdminCourse' ? AdminCourse : Course).findById(lesson.courseId);
            if (course) {
                const module = course.modules.find(m => m._id.toString() === moduleId.toString());
                if (module) lesson.moduleName = module.title;
            }
        } else if (moduleName) {
            const course = await (lesson.courseType === 'AdminCourse' ? AdminCourse : Course).findById(lesson.courseId);
            if (course) {
                let targetModule = course.modules.find(m => m.title.toLowerCase() === moduleName.trim().toLowerCase());

                if (!targetModule) {
                    const nextModuleOrder = course.modules.length > 0
                        ? Math.max(...course.modules.map(m => m.order || 0)) + 1
                        : 1;

                    targetModule = {
                        title: moduleName.trim(),
                        order: nextModuleOrder
                    };
                    course.modules.push(targetModule);
                    await course.save();
                    targetModule = course.modules[course.modules.length - 1];
                }

                lesson.moduleId = targetModule._id;
                lesson.moduleName = targetModule.title;
            }
        }

        // Handle file upload (document)
        if (req.file) {
            const ext = path.extname(req.file.originalname).toLowerCase();
            let type = 'other';
            if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) type = 'image';
            else if (['.mp4', '.mov', '.avi'].includes(ext)) type = 'video';
            else if (['.pdf'].includes(ext)) type = 'pdf';
            else if (['.doc', '.docx'].includes(ext)) type = 'doc';

            lesson.content.push({
                url: req.file.path.replace(/\\/g, '/'),
                type
            });
        }

        await lesson.save();

        res.status(200).json({
            success: true,
            message: 'Lesson updated successfully',
            data: lesson
        });
    } catch (error) {
        console.error('Update Lesson Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

const lessonController = {
    createLesson,
    getLessonById,
    getLessonsByCourseAndModule,
    updateLesson
};

export default lessonController;
