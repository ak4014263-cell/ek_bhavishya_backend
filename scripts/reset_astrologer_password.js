/**
 * Run on server: node scripts/reset_astrologer_password.js email@example.com NewPass123
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import dns from 'dns';
import User from '../src/models/User.js';
import Astrologer from '../src/models/Astrologer.js';
import { emailLookupRegex, normalizeEmail } from '../src/utils/authEmail.js';
import { resolveAstrologerForUser } from '../src/utils/astrologerLink.js';

dotenv.config();

const [,, emailArg, passwordArg] = process.argv;
if (!emailArg || !passwordArg) {
    console.error('Usage: node scripts/reset_astrologer_password.js <email> <newPassword>');
    process.exit(1);
}

if (process.env.MONGO_DNS_SERVERS) {
    dns.setServers(process.env.MONGO_DNS_SERVERS.split(','));
}

const run = async () => {
    await mongoose.connect(process.env.MONGO_URI);
    const emailRegex = emailLookupRegex(emailArg);
    let user = await User.findOne({ email: emailRegex });
    if (!user) {
        const astro = await Astrologer.findOne({
            'personalDetails.email': emailRegex,
        });
        if (astro?.userId) user = await User.findById(astro.userId);
    }
    if (!user) {
        console.error('No user for:', emailArg);
        process.exit(1);
    }
    user.role = 'astrologer';
    user.password = passwordArg;
    user.status = 'Active';
    await user.save();
    const astro = await resolveAstrologerForUser(user);
    console.log('Password updated:', user.email, 'userId:', user._id, 'astrologer:', astro?._id);
    await mongoose.disconnect();
};

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
