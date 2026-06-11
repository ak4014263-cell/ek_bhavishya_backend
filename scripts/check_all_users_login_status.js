import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Astrologer from '../src/models/Astrologer.js';
import Seller from '../src/models/Seller.js';
import dotenv from 'dotenv';

dotenv.config();
import connectDB from '../src/config/db.js';

const checkAllUsersLoginStatus = async () => {
    try {
        await connectDB();
        console.log('Connected to MongoDB\n');

        console.log('=== CHECKING LOGIN STATUS FOR ALL USERS ===\n');

        // Check astrologers
        console.log('ASTROLOGERS:');
        console.log('━'.repeat(80));
        const astrologerUsers = await User.find({ role: 'astrologer' }).limit(50);
        
        const astrologerIssues = [];
        
        for (const user of astrologerUsers) {
            const profile = await Astrologer.findOne({ userId: user._id });
            
            let issues = [];
            if (!user.password) issues.push('NO PASSWORD HASH');
            if (user.status === 'Blocked') issues.push('BLOCKED');
            if (!profile) issues.push('NO PROFILE');
            if (profile && !profile.systemStatus?.isApproved && !profile.isApproved) issues.push('NOT APPROVED');
            
            const status = issues.length === 0 ? '✓ OK' : '✗ ISSUE: ' + issues.join(', ');
            console.log(`${user.email || user.phoneNumber} | ${status}`);
            
            if (issues.length > 0) {
                astrologerIssues.push({
                    identifier: user.email || user.phoneNumber,
                    issues,
                    userId: user._id
                });
            }
        }

        // Check sellers
        console.log('\n\nSELLERS:');
        console.log('━'.repeat(80));
        const sellerUsers = await User.find({ role: 'seller' }).limit(50);
        
        const sellerIssues = [];
        
        for (const user of sellerUsers) {
            const profile = await Seller.findOne({ userId: user._id });
            
            let issues = [];
            if (!user.password) issues.push('NO PASSWORD HASH');
            if (user.status === 'Blocked') issues.push('BLOCKED');
            if (!profile) issues.push('NO PROFILE');
            if (profile && !profile.is_approved) issues.push('NOT APPROVED');
            
            const status = issues.length === 0 ? '✓ OK' : '✗ ISSUE: ' + issues.join(', ');
            console.log(`${user.email} | ${status}`);
            
            if (issues.length > 0) {
                sellerIssues.push({
                    identifier: user.email,
                    issues,
                    userId: user._id
                });
            }
        }

        // Summary
        console.log('\n\n=== SUMMARY ===');
        console.log(`Total Astrologers: ${astrologerUsers.length}`);
        console.log(`  With issues: ${astrologerIssues.length}`);
        console.log(`Total Sellers: ${sellerUsers.length}`);
        console.log(`  With issues: ${sellerIssues.length}`);

        if (astrologerIssues.length > 0) {
            console.log('\n\nASTROLOGER FIXES NEEDED:');
            console.log('━'.repeat(80));
            for (const issue of astrologerIssues) {
                console.log(`\n${issue.identifier}:`);
                for (const prob of issue.issues) {
                    if (prob === 'NO PASSWORD HASH') {
                        console.log(`  → Fix: node scripts/reset_user_password.js "${issue.identifier}" NewPass@123 astrologer`);
                    } else if (prob === 'BLOCKED') {
                        console.log(`  → Fix: Contact admin or run: db.users.updateOne({_id: ObjectId("${issue.userId}")}, {$set: {status: "Active"}})`);
                    } else if (prob === 'NO PROFILE') {
                        console.log(`  → Fix: User exists but no astrologer profile. May need manual intervention.`);
                    } else if (prob === 'NOT APPROVED') {
                        console.log(`  → Info: Not approved yet. User can login but with limited access.`);
                    }
                }
            }
        }

        if (sellerIssues.length > 0) {
            console.log('\n\nSELLER FIXES NEEDED:');
            console.log('━'.repeat(80));
            for (const issue of sellerIssues) {
                console.log(`\n${issue.identifier}:`);
                for (const prob of issue.issues) {
                    if (prob === 'NO PASSWORD HASH') {
                        console.log(`  → Fix: node scripts/reset_user_password.js "${issue.identifier}" NewPass@123 seller`);
                    } else if (prob === 'BLOCKED') {
                        console.log(`  → Fix: Contact admin or unblock in MongoDB`);
                    } else if (prob === 'NO PROFILE') {
                        console.log(`  → Fix: User exists but no seller profile. May need manual intervention.`);
                    } else if (prob === 'NOT APPROVED') {
                        console.log(`  → Info: Seller not approved yet. Limited access.`);
                    }
                }
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

checkAllUsersLoginStatus();