import express from 'express';
import { getAllBlogs, getBlogById, createBlog, getMyBlogs, updateBlog, deleteBlog } from '../controllers/blogController.js';
import upload from '../middleware/upload.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/', getAllBlogs);
// Must be registered before /:id so "my" is not captured as an id
router.get('/my/all', protect, getMyBlogs);
router.get('/:id', getBlogById);
router.post('/', protect, upload.single('image'), createBlog);
router.put('/:id', protect, upload.single('image'), updateBlog);
router.delete('/:id', protect, deleteBlog);

export default router;
