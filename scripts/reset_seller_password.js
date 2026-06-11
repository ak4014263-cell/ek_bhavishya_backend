/**
 * Run on the server to set/reset a seller password:
 *   node scripts/reset_seller_password.js email@example.com NewPassword123
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import dns from 'dns';
import User from '../src/models/User.js';
import Seller from '../src/models/Seller.js';
import { emailLookupRegex, normalizeEmail } from '../src/utils/authEmail.js';

dotenv.config();

const [,, emailArg, passwordArg] = process.argv;
if (!emailArg || !passwordArg) {
    console.error('Usage: node scripts/reset_seller_password.js <email> <newPassword>');
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
        const sellerDoc = await Seller.findOne({
            $or: [{ email: emailRegex }, { email: normalizeEmail(emailArg) }],
        });
        if (sellerDoc?.userId) user = await User.findById(sellerDoc.userId);
    }
    if (!user) {
        console.error('No user found for:', emailArg);
        process.exit(1);
    }
    user.role = 'seller';
    user.password = passwordArg;
    user.status = 'Active';
    await user.save();
    let seller = await Seller.findOne({ userId: user._id });
    if (!seller) {
        seller = await Seller.create({
            userId: user._id,
            storeName: user.fullName || 'My Store',
            email: normalizeEmail(emailArg) || user.email,
            status: 'Inactive',
            is_approved: false,
        });
    }
    console.log('Password updated for seller:', user.email, 'userId:', user._id);
    await mongoose.disconnect();
};

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
