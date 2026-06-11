import Blog from '../../../models/Blog.js';

const createBlog = async (req, res) => {
  try {
    const { title, content, author } = req.body;
    const image = req.files && req.files['image'] ? req.files['image'][0].path : null;
    
    // Admin info from JWT token
    const adminId = req.admin.id || req.admin._id;
    const adminName = req.admin.name || 'Admin';
    const adminEmail = req.admin.email;

    // If author is provided, use astrologer as author; otherwise use admin as author
    const blogData = {
      title,
      content,
      image,
      createdByAdmin: adminId,
      adminName,
      adminEmail,
    };

    if (author) {
      // Astrologer author provided
      blogData.author = author;
      blogData.authorType = 'Astrologer';
    } else {
      // Admin is the author
      blogData.author = adminId;
      blogData.authorType = 'Admin';
    }

    const blog = await Blog.create(blogData);

    return res.status(201).json({ message: 'Blog created successfully', blog });
  } catch (error) {
    console.log("Error: ", error);
    return res.status(500).json({ message: error.message, error: error });
  }
};

const getAllBlogs = async (req, res) => {
  try {
    const { status, search } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
    const skip = (page - 1) * limit;

    const filter = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
      ];
    }

    const blogs = await Blog.find(filter)
      .populate('authorId', 'fullName email')
      .populate('astrologerId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Map blogs to include clean author name and email fields
    const blogsWithAuthor = blogs.map(blog => {
      let authorName, authorEmail;

      if (blog.astrologerId) {
        authorName = blog.astrologerId.name;
        authorEmail = blog.astrologerId.email;
      } else if (blog.authorId) {
        authorName = blog.authorId.fullName;
        authorEmail = blog.authorId.email;
      } else {
        authorName = blog.adminName || 'Unknown';
        authorEmail = blog.adminEmail || 'N/A';
      }

      return {
        _id: blog._id,
        title: blog.title,
        image: blog.image,
        imageUrl: blog.image ? (blog.image.startsWith('http') ? blog.image : `${req.protocol}://${req.get('host')}/${blog.image.replace(/\\/g, '/')}`) : null,
        status: blog.status,
        views: blog.views,
        createdAt: blog.createdAt,
        updatedAt: blog.updatedAt,
        rejectionReason: blog.rejectionReason,
        authorName,
        authorEmail,
        authorType: blog.authorType,
      };
    });

    const total = await Blog.countDocuments(filter);

    res.status(200).json({
      success: true,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
      data: blogsWithAuthor,
    });
  } catch (error) {
    console.error('Get All Blogs Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const getBlogById = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, message: 'ID is required' });

    let blog = await Blog.findById(id)
      .populate('author', 'personalDetails.name personalDetails.email')
      .populate('createdByAdmin', 'name email')
      .lean();

    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found.' });
    }

    // Format blog response with clean author data based on authorType
    let authorName, authorEmail;

    if (blog.authorType === 'Astrologer' && blog.author?.personalDetails) {
      // Astrologer author
      authorName = blog.author.personalDetails.name;
      authorEmail = blog.author.personalDetails.email;
    } else if (blog.authorType === 'Admin' && blog.createdByAdmin) {
      // Admin author
      authorName = blog.createdByAdmin.name;
      authorEmail = blog.createdByAdmin.email;
    } else {
      // Fallback
      authorName = blog.adminName || null;
      authorEmail = blog.adminEmail || null;
    }

    const formattedBlog = {
      ...blog,
      imageUrl: blog.image ? (blog.image.startsWith('http') ? blog.image : `${req.protocol}://${req.get('host')}/${blog.image.replace(/\\/g, '/')}`) : null,
      authorName,
      authorEmail,
      authorType: blog.authorType,
      author: undefined,
      createdByAdmin: undefined
    };

    // Increment view count
    await Blog.findByIdAndUpdate(id, { $inc: { views: 1 } });

    res.status(200).json({ success: true, blog: formattedBlog });
  } catch (error) {
    console.error('Get Blog By ID Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const updateBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, author, status, rejectionReason } = req.body;
    const image = req.files && req.files['image'] ? req.files['image'][0].path : undefined;

    if (!id) return res.status(400).json({ success: false, message: 'ID is required' });

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found.' });
    }

    if (title !== undefined) blog.title = title.trim();
    if (content !== undefined) blog.content = content.trim();
    if (author !== undefined) blog.author = author;
    if (image !== undefined) blog.image = image;
    if (status !== undefined) blog.status = status;
    if (rejectionReason !== undefined) blog.rejectionReason = rejectionReason;

    const updatedBlog = await blog.save();

    res.status(200).json({
      success: true,
      message: 'Blog updated successfully.',
      blog: updatedBlog,
    });
  } catch (error) {
    console.error('Update Blog Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, message: 'ID is required' });

    const blog = await Blog.findByIdAndDelete(id);
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found.' });
    }

    res.status(200).json({
      success: true,
      message: 'Blog deleted successfully.',
      blog,
    });
  } catch (error) {
    console.error('Delete Blog Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const approveBlog = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, message: 'ID is required' });

    const blog = await Blog.findByIdAndUpdate(
      id,
      { status: 'Approved' },
      { new: true }
    ).populate('author', 'personalDetails.name personalDetails.email')
     .populate('createdByAdmin', 'name email');

    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found.' });
    }

    res.status(200).json({
      success: true,
      message: 'Blog approved successfully.',
      blog,
    });
  } catch (error) {
    console.error('Approve Blog Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const rejectBlog = async (req, res) => {
  try {
    const { id, rejectionReason } = req.body;
    if (!id) return res.status(400).json({ success: false, message: 'ID is required' });

    if (!rejectionReason) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
    }

    const blog = await Blog.findByIdAndUpdate(
      id,
      { status: 'Rejected', rejectionReason },
      { new: true }
    ).populate('author', 'personalDetails.name personalDetails.email')
     .populate('createdByAdmin', 'name email');

    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found.' });
    }

    res.status(200).json({
      success: true,
      message: 'Blog rejected successfully.',
      blog,
    });
  } catch (error) {
    console.error('Reject Blog Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const blogController = {
  createBlog,
  getAllBlogs,
  getBlogById,
  updateBlog,
  deleteBlog,
  approveBlog,
  rejectBlog,

};

export default blogController;

