import mongoose from 'mongoose';
import Blog from './src/models/Blog.js';
import User from './src/models/User.js';
import connectDB from './src/config/db.js';
import dotenv from 'dotenv';

dotenv.config();

const seedBlogs = async () => {
    try {
        await connectDB();
        console.log('Connected to MongoDB');

        // Find an admin or any user to be the author
        const author = await User.findOne();
        if (!author) {
            console.log('No user found to be author. Please register a user first.');
            process.exit(1);
        }

        const blogs = [
            {
                title: 'The Secret of Vastu Shastra',
                content: 'Vastu Shastra is an ancient Indian science of architecture and buildings...',
                category: 'Vastu',
                imageUrl: 'https://picsum.photos/800/400?sig=20',
                authorId: author._id,
                isPublished: true
            },
            {
                title: 'Daily Horoscope: Your Path to Success',
                content: 'Aligning your activities with the planets can significantly improve your success rate...',
                category: 'Horoscope',
                imageUrl: 'https://picsum.photos/800/400?sig=21',
                authorId: author._id,
                isPublished: true
            }
        ];

        await Blog.deleteMany({}); // Clear existing
        await Blog.insertMany(blogs);

        console.log('Blogs seeded successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding blogs:', error);
        process.exit(1);
    }
};

seedBlogs();
