
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve('c:/Users/hp/Downloads/OneAim/OneAim/backend/.env') });

// Import models using full paths to ensure availability
import User from '../models/User.js';
import Astrologer from '../models/Astrologer.js';
import Interview from '../modules/admin/models/InterviewModel.js';

async function updateInterview() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const email = 'ak4014263@gmail.com';
        const user = await User.findOne({ email });

        if (!user) {
            console.log('User not found with email:', email);
            process.exit(1);
        }

        const astrologer = await Astrologer.findOne({ userId: user._id });
        if (!astrologer) {
            console.log('Astrologer profile not found for user:', user._id);
            process.exit(1);
        }

        let interview = await Interview.findOne({ astrologer_id: astrologer._id });
        if (!interview) {
            console.log('Interview record not found, creating one...');
            interview = new Interview({
                astrologer_id: astrologer._id
            });
        }

        // Mark all phases as completed
        interview.phase1.status = 'Completed';
        interview.phase2.status = 'Completed';
        interview.phase3.status = 'Completed';
        interview.current_phase = 3;
        interview.final_status = 'Approved';

        await interview.save();
        console.log('Interview marked as completed and approved for:', email);

        // Also update astrologer's approval status
        astrologer.isApproved = true;
        await astrologer.save();
        console.log('Astrologer marked as approved');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

updateInterview();
