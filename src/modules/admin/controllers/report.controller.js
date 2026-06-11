import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';

const getDailyUsageAnalytics = async (req, res) => {
    try {
        let { startDate, endDate, format, gap } = req.query;
        if (format) format = format.trim().toLowerCase();

        // --- 0. Parse Gap ---
        const hourGap = parseInt(gap) || 1; // Default to 1 hour
        const validGap = (24 % hourGap === 0) ? hourGap : 1; // Ensure 24 is divisible, else fallback to 1

        // --- Calculation Helpers ---
        const calcRate = (numerator, denominator) => {
            if (!denominator || denominator === 0) return "0.0%";
            return ((numerator / denominator) * 100).toFixed(1) + "%";
        };

        const end = endDate ? new Date(endDate) : new Date();
        const start = startDate ? new Date(startDate) : new Date();
        if (!startDate) start.setDate(end.getDate() - 30);

        // Set to start/end of day
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        // --- 1. Fetch Data ---

        // A. Users created in range
        const users = await mongoose.model('User').find({ createdAt: { $gte: start, $lte: end } })
            .select('createdAt is_verified status fullName gender dob birthTime birthPlace');

        // B. Wallet Recharges (Subscriptions)
        const recharges = await mongoose.model('UserWalletTransaction').find({
            createdAt: { $gte: start, $lte: end },
            reason: 'wallet_recharge'
        }).select('createdAt amount userId');

        // C. Consultations (Calls, Chats & Live)
        const [callSessions, chatSessions, liveSessions] = await Promise.all([
            mongoose.model('CallSession').find({ createdAt: { $gte: start, $lte: end } })
                .select('createdAt status userId'),
            mongoose.model('ChatSession').find({ createdAt: { $gte: start, $lte: end } })
                .select('createdAt status userId messages'),
            mongoose.model('LiveSession').find({ createdAt: { $gte: start, $lte: end } })
                .select('createdAt status userId')
        ]);

        // D. First Readings Logic
        // Find users whose *first ever* session occurred within the range
        const CallSession = mongoose.model('CallSession');
        const ChatSession = mongoose.model('ChatSession');
        const LiveSession = mongoose.model('LiveSession');

        const firstSessionsAgg = await CallSession.aggregate([
            { $group: { _id: "$userId", firstSession: { $min: "$createdAt" } } },
            { $match: { firstSession: { $gte: start, $lte: end } } }
        ]);

        const firstChatSessionsAgg = await ChatSession.aggregate([
            { $group: { _id: "$userId", firstSession: { $min: "$createdAt" } } },
            { $match: { firstSession: { $gte: start, $lte: end } } }
        ]);

        const firstLiveSessionsAgg = await LiveSession.aggregate([
            { $group: { _id: "$userId", firstSession: { $min: "$createdAt" } } },
            { $match: { firstSession: { $gte: start, $lte: end } } }
        ]);

        // Map user -> first session date
        const firstReadingMap = new Map();
        [...firstSessionsAgg, ...firstChatSessionsAgg, ...firstLiveSessionsAgg].forEach(item => {
            if (!item._id) return; // Skip sessions with no userId
            const date = new Date(item.firstSession);
            const userId = item._id.toString();
            if (!firstReadingMap.has(userId) || date < firstReadingMap.get(userId)) {
                firstReadingMap.set(userId, date);
            }
        });


        // --- 2. Initialize Daily Stats Map ---
        const dailyStatsMap = new Map();
        const initializeDay = (dateStr) => {
            if (!dailyStatsMap.has(dateStr)) {
                dailyStatsMap.set(dateStr, {
                    date: dateStr,
                    // Funnel
                    totalProfilesCreated: 0,
                    verifiedProfiles: 0,
                    profilesCompleted: 0,
                    subscriptions: 0,
                    firstReadings: 0,
                    // Consultations
                    doneConsultations: 0,
                    failedConsultations: 0
                });
            }
            return dailyStatsMap.get(dateStr);
        };

        // Initialize all days
        const currentDate = new Date(start);
        while (currentDate <= end) {
            initializeDay(currentDate.toISOString().split('T')[0]);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        // --- 3. Aggregate Metrics (Proper Cohort Tracking) ---

        // Group users by creation date
        const usersByDate = new Map();
        users.forEach(user => {
            const dateStr = user.createdAt.toISOString().split('T')[0];
            if (!usersByDate.has(dateStr)) {
                usersByDate.set(dateStr, []);
            }
            usersByDate.get(dateStr).push(user);
        });

        // Create lookup maps for subscriptions and first readings
        const subscriptionsByUser = new Map();
        recharges.forEach(txn => {
            const userId = txn.userId.toString();
            if (!subscriptionsByUser.has(userId)) {
                subscriptionsByUser.set(userId, []);
            }
            subscriptionsByUser.get(userId).push(txn);
        });

        // Process each day's cohort
        usersByDate.forEach((usersCreatedOnDay, dateStr) => {
            const stats = initializeDay(dateStr);
            if (!stats) return;

            // Total users created on this day
            stats.totalProfilesCreated = usersCreatedOnDay.length;

            // Track progression of ONLY these users through all stages
            let verifiedCount = 0;
            let profileCompletedCount = 0;
            let firstReadingCount = 0;
            let subscriptionCount = 0;

            usersCreatedOnDay.forEach(user => {
                const userId = user._id.toString();

                // Stage 1: Verified (OTP + Active status)
                if (user.is_verified && user.status === 'Active') {
                    verifiedCount++;

                    // Stage 2: Profile Completed
                    if (user.fullName && user.gender && user.dob && user.birthTime && user.birthPlace) {
                        profileCompletedCount++;

                        // Stage 3: First Reading (check if user has any session)
                        if (firstReadingMap.has(userId)) {
                            firstReadingCount++;

                            // Stage 4: Subscription (check if user has recharged)
                            if (subscriptionsByUser.has(userId)) {
                                subscriptionCount++;
                            }
                        }
                    }
                }
            });

            stats.verifiedProfiles = verifiedCount;
            stats.profilesCompleted = profileCompletedCount;
            stats.firstReadings = firstReadingCount;
            stats.subscriptions = subscriptionCount;
        });

        // E. Aggregate Consultation Session Success/Failure
        callSessions.forEach(session => {
            const dateStr = session.createdAt.toISOString().split('T')[0];
            const stats = initializeDay(dateStr);
            if (!stats) return;

            if (['ended', 'active'].includes(session.status)) {
                stats.doneConsultations++;
            } else {
                stats.failedConsultations++;
            }
        });

        chatSessions.forEach(session => {
            const dateStr = session.createdAt.toISOString().split('T')[0];
            const stats = initializeDay(dateStr);
            if (!stats) return;

            // For chats, we can consider it "done" if there are messages
            if (session.messages && session.messages.length > 0) {
                stats.doneConsultations++;
            } else {
                stats.failedConsultations++;
            }
        });

        liveSessions.forEach(session => {
            const dateStr = session.createdAt.toISOString().split('T')[0];
            const stats = initializeDay(dateStr);
            if (!stats) return;

            if (session.status === 'ended') {
                stats.doneConsultations++;
            } else {
                stats.failedConsultations++;
            }
        });





        // --- 4. Final Formatting ---
        const dailyStats = [];
        const sortedDates = Array.from(dailyStatsMap.keys()).sort();

        sortedDates.forEach(dateStr => {
            const d = dailyStatsMap.get(dateStr);
            dailyStats.push({
                date: dateStr,
                // Funnel (proper cohort tracking)
                funnel: {
                    created: d.totalProfilesCreated,
                    verified: d.verifiedProfiles,
                    profileCompleted: d.profilesCompleted,
                    firstReading: d.firstReadings,
                    subscription: d.subscriptions
                },
                // Successful completions for each stage
                successful: {
                    onboarding: d.verifiedProfiles,
                    profileSetup: d.profilesCompleted,
                    firstReading: d.firstReadings,
                    subscription: d.subscriptions
                },
                // Drop-offs for each stage
                dropOff: {
                    onboarding: d.totalProfilesCreated - d.verifiedProfiles,
                    profileSetup: d.verifiedProfiles - d.profilesCompleted,
                    firstReading: d.profilesCompleted - d.firstReadings,
                    subscription: d.firstReadings - d.subscriptions
                },
                // Conversion rates (all calculated from 'created' count)
                conversionRates: {
                    onboarding: calcRate(d.verifiedProfiles, d.totalProfilesCreated),
                    profileSetup: calcRate(d.profilesCompleted, d.totalProfilesCreated),
                    firstReading: calcRate(d.firstReadings, d.totalProfilesCreated),
                    subscription: calcRate(d.subscriptions, d.totalProfilesCreated)
                },
                // Consultations
                consultations: {
                    done: d.doneConsultations,
                    failed: d.failedConsultations,
                    total: d.doneConsultations + d.failedConsultations
                }
            });
        });

        // --- 5. Export ---

        if (format === 'csv') {
            const headers = [
                'Date',
                'Created', 'Verified', 'Profile Completed', 'First Reading', 'Subscription',
                'Successful Onboarding', 'Successful Profile Setup', 'Successful First Reading', 'Successful Subscription',
                'Onboarding Drop-off', 'Profile Drop-off', 'Reading Drop-off', 'Subscription Drop-off',
                'Onboarding Conv%', 'Profile Conv%', 'Reading Conv%', 'Subscription Conv%',
                'Consultations Done', 'Consultations Failed', 'Total Consultations'
            ];

            const csvRows = dailyStats.map(r => [
                r.date,
                r.funnel.created, r.funnel.verified, r.funnel.profileCompleted, r.funnel.firstReading, r.funnel.subscription,
                r.successful.onboarding, r.successful.profileSetup, r.successful.firstReading, r.successful.subscription,
                r.dropOff.onboarding, r.dropOff.profileSetup, r.dropOff.firstReading, r.dropOff.subscription,
                r.conversionRates.onboarding, r.conversionRates.profileSetup, r.conversionRates.firstReading, r.conversionRates.subscription,
                r.consultations.done, r.consultations.failed, r.consultations.total
            ].join(','));

            const csvString = [headers.join(','), ...csvRows].join('\n');
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=daily-usage-report.csv');
            return res.status(200).send(csvString);
        }

        if (format === 'pdf') {
            const doc = new PDFDocument({ margin: 10, size: 'A4', layout: 'landscape' }); // Reduced margin
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=daily-usage-report.pdf');
            doc.pipe(res);

            doc.fontSize(18).text('Daily Usage & Engagement Report', { align: 'center' });
            doc.fontSize(10).text(`${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]}`, { align: 'center' });
            doc.moveDown();

            // Adjusted Table for More Columns
            const tableTop = 100;
            const startX = 10;
            const colCount = 13;
            const colWidth = 60; // Slightly wider

            const headers = [
                'Date',
                'Created', 'Verified', 'Profile', 'Reading', 'Subscription',
                'Drop-offs\n(On/Pr/Re/Su)',
                'Conv%\n(On/Pr/Re/Su)',
                'Consultations\n(Done/Fail/Tot)'
            ];

            // Draw Headers
            doc.font('Helvetica-Bold').fontSize(8);
            headers.forEach((h, i) => {
                let w = 50;
                if (i === 0) w = 60; // Date
                if (i >= 1 && i <= 5) w = 40; // Funnel stages (changed from 45 to 40)
                if (i === 6 || i === 7) w = 80; // Drop-offs and Conv% (changed from 90 to 80)
                if (i === 8) w = 80; // Consultations (new)

                let currentX = startX;
                for (let j = 0; j < i; j++) {
                    if (j === 0) currentX += 60;
                    else if (j >= 1 && j <= 5) currentX += 40;
                    else if (j === 6 || j === 7) currentX += 80;
                    else if (j === 8) currentX += 80;
                    else currentX += 50; // Fallback, though all columns should be covered
                }

                doc.text(h, currentX, tableTop, { width: w, align: 'center' });
            });

            doc.moveTo(startX, tableTop + 25).lineTo(830, tableTop + 25).stroke();

            // Draw Rows
            let y = tableTop + 35;
            doc.font('Helvetica').fontSize(8);

            dailyStats.forEach(row => {
                if (y > 500) {
                    doc.addPage();
                    y = 50;
                }

                const vals = [
                    row.date,
                    row.funnel.created, row.funnel.verified, row.funnel.profileCompleted, row.funnel.firstReading, row.funnel.subscription,
                    `${row.dropOff.onboarding}/${row.dropOff.profileSetup}/${row.dropOff.firstReading}/${row.dropOff.subscription}`,
                    `${row.conversionRates.onboarding}/${row.conversionRates.profileSetup}/${row.conversionRates.firstReading}/${row.conversionRates.subscription}`,
                    `${row.consultations.done}/${row.consultations.failed}/${row.consultations.total}`
                ];

                vals.forEach((v, i) => {
                    let w = 50;
                    if (i === 0) w = 60;
                    if (i >= 1 && i <= 5) w = 40;
                    if (i === 6 || i === 7) w = 80;
                    if (i === 8) w = 80;

                    let currentX = startX;
                    for (let j = 0; j < i; j++) {
                        if (j === 0) currentX += 60;
                        else if (j >= 1 && j <= 5) currentX += 40;
                        else if (j === 6 || j === 7) currentX += 80;
                        else if (j === 8) currentX += 80;
                        else currentX += 50; // Fallback
                    }

                    doc.text(v.toString(), currentX, y, { width: w, align: 'center' });
                });
                y += 22;
            });

            doc.end();
            return;
        }

        // --- Calculate Summary Totals ---
        const summary = {
            dateRange: { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0], totalDays: dailyStats.length },
            totalFunnel: {
                created: 0,
                verified: 0,
                profileCompleted: 0,
                firstReading: 0,
                subscription: 0
            },
            totalSuccessful: {
                onboarding: 0,
                profileSetup: 0,
                firstReading: 0,
                subscription: 0
            },
            totalDropOff: {
                onboarding: 0,
                profileSetup: 0,
                firstReading: 0,
                subscription: 0
            },
            totalConsultations: {
                done: 0,
                failed: 0,
                total: 0
            },
            peakUsage: Array.from({ length: Math.ceil(24 / validGap) }, (_, i) => {
                const startHour = i * validGap;
                const endHour = (i + 1) * validGap;
                return {
                    slot: `${startHour.toString().padStart(2, '0')}:00-${(endHour >= 24 ? 0 : endHour).toString().padStart(2, '0')}:00`,
                    done: 0,
                    failed: 0,
                    total: 0
                };
            })
        };

        // Helper to process sessions for peak usage
        const processSessionForPeak = (session, isDone) => {
            const hour = session.createdAt.getHours();
            const slotIndex = Math.floor(hour / validGap);
            if (isDone) {
                summary.peakUsage[slotIndex].done++;
            } else {
                summary.peakUsage[slotIndex].failed++;
            }
            summary.peakUsage[slotIndex].total++;
        };

        dailyStats.forEach(day => {
            summary.totalFunnel.created += day.funnel.created;
            summary.totalFunnel.verified += day.funnel.verified;
            summary.totalFunnel.profileCompleted += day.funnel.profileCompleted;
            summary.totalFunnel.firstReading += day.funnel.firstReading;
            summary.totalFunnel.subscription += day.funnel.subscription;
            summary.totalSuccessful.onboarding += day.successful.onboarding;
            summary.totalSuccessful.profileSetup += day.successful.profileSetup;
            summary.totalSuccessful.firstReading += day.successful.firstReading;
            summary.totalSuccessful.subscription += day.successful.subscription;
            // Aggregating consultations
            summary.totalConsultations.done += day.consultations.done;
            summary.totalConsultations.failed += day.consultations.failed;
            summary.totalConsultations.total += day.consultations.total;
        });

        // Populate peak hourly usage
        callSessions.forEach(s => processSessionForPeak(s, ['ended', 'active'].includes(s.status)));
        chatSessions.forEach(s => processSessionForPeak(s, s.messages && s.messages.length > 0));
        liveSessions.forEach(s => processSessionForPeak(s, s.status === 'ended'));

        summary.totalDropOff.onboarding = summary.totalFunnel.created - summary.totalFunnel.verified;
        summary.totalDropOff.profileSetup = summary.totalFunnel.verified - summary.totalFunnel.profileCompleted;
        summary.totalDropOff.firstReading = summary.totalFunnel.profileCompleted - summary.totalFunnel.firstReading;
        summary.totalDropOff.subscription = summary.totalFunnel.firstReading - summary.totalFunnel.subscription;

        res.status(200).json({ success: true, summary, dailyBreakdown: dailyStats });

    } catch (error) {
        console.error('Report Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}

export default {
    getDailyUsageAnalytics
};
