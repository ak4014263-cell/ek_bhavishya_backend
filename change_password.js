import mongoose from 'mongoose';
import User from './src/models/User.js';
import dotenv from 'dotenv';

dotenv.config();
import connectDB from './src/config/db.js';

const changePassword = async () => {
    try {
        const email = 'gargimishra85543@gmail.com';
        const newPassword = process.argv[2] || 'NewPassword@123';

        await connectDB();
        console.log('Connected to MongoDB\n');

        // Find user by email
        let user = await User.findOne({ email });
        
        if (!user) {
            console.error(`No user found with email: ${email}`);
            process.exit(1);
        }

        console.log(`Found user: ${user.email}`);
        console.log(`Current role: ${user.role}`);
        console.log(`Current status: ${user.status}`);

        // Update password (will be hashed by pre-save hook)
        user.password = newPassword;
        
        // Ensure active status
        user.status = 'Active';
        
        await user.save();
        console.log('\n✓ Password changed successfully!');
        console.log(`Email: ${user.email}`);
        console.log(`New Password: ${newPassword}`);
        console.log(`Role: ${user.role}`);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
};

changePassword();
