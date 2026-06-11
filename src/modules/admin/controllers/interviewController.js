import Interview from "../models/InterviewModel.js"
import Astrologer from "../../../models/Astrologer.js";
import User from "../../../models/User.js";
import sendEmail from '../utils/NodemailerConfig.js';
import crypto from 'crypto';

/**
 * Schedule an interview phase
 */
export const scheduleMeeting = async (req, res) => {
    try {
        const { astrologer_id, phase, meeting_time, meeting_link } = req.body;

        if (![1, 2, 3].includes(phase)) {
            return res.status(400).json({ success: false, message: "Invalid phase. Must be 1, 2, or 3." });
        }

        const astrologer = await Astrologer.findById(astrologer_id);
        if (!astrologer) {
            return res.status(404).json({ success: false, message: "Astrologer not found" });
        }

        const dateObj = new Date(meeting_time);
        if (isNaN(dateObj.getTime())) {
            return res.status(400).json({ success: false, message: "Invalid date format provided" });
        }

        const indianTimeStr = dateObj.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });

        const phaseKey = `phase${phase}`;
        const updateData = {
            current_phase: phase,
            [phaseKey]: {
                status: 'Scheduled',
                meeting_time: dateObj,
                meeting_link
            }
        };

        const interviewData = await Interview.findOneAndUpdate(
            { astrologer_id },
            { $set: updateData },
            { upsert: true, new: true, returnDocument: 'after' }
        );

        // Update status in Astrologer model
        await Astrologer.findByIdAndUpdate(astrologer_id, {
            status: 'Pending',
            verificationStatus: 'Pending'
        });

        // Send Phase-specific Email (Non-blocking)
        const phaseNames = ["Screening Interview", "Technical Assessment", "Final Verification"];
        const phaseName = phaseNames[phase - 1];

        sendEmail({
            email: astrologer.personalDetails.email,
            subject: `Interview Scheduled: Phase ${phase} - ${phaseName}`,
            html: `
                <div style="font-family: Arial, sans-serif; border: 1px solid #ddd; padding: 20px; border-radius: 10px; max-width: 600px;">
                    <h2 style="color: #1a73e8;">Phase ${phase}: ${phaseName}</h2>
                    <p>Hello <b>${astrologer.personalDetails.name}</b>,</p>
                    <p>Your <b>${phaseName}</b> has been scheduled as part of our 3-phase verification process.</p>
                    
                    <div style="background-color: #f8f9fa; padding: 15px; border-left: 5px solid #1a73e8; margin: 20px 0;">
                        <p style="margin: 5px 0;">📅 <b>Date & Time:</b> ${indianTimeStr} (IST)</p>
                        <p style="margin: 5px 0;">🔗 <b>Meeting Link:</b> <a href="${meeting_link}">Click here to Join</a></p>
                    </div>

                    <p>Please be ready 10 minutes before the scheduled time.</p>
                    <hr style="border: none; border-top: 1px solid #eee;" />
                    <p style="font-size: 0.8em; color: #777;">This is an automated recruitment update.</p>
                </div>
            `
        }).catch(err => console.error("Non-blocking Email Error:", err));

        res.status(200).json({
            success: true,
            message: `Phase ${phase} scheduled successfully`,
            data: interviewData
        });

    } catch (error) {
        console.error("Schedule Meeting Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Reschedule an interview phase
 */
export const rescheduleMeeting = async (req, res) => {
    try {
        const { astrologer_id, phase, new_meeting_time, new_meeting_link } = req.body;

        if (![1, 2, 3].includes(phase)) {
            return res.status(400).json({ success: false, message: "Invalid phase." });
        }

        const dateObj = new Date(new_meeting_time);
        if (isNaN(dateObj.getTime())) {
            return res.status(400).json({ success: false, message: "Invalid date format." });
        }

        const astrologer = await Astrologer.findById(astrologer_id);
        if (!astrologer) return res.status(404).json({ success: false, message: "Astrologer not found" });

        const indianTimeStr = dateObj.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        });

        const phaseKey = `phase${phase}`;
        const updatedInterview = await Interview.findOneAndUpdate(
            { astrologer_id },
            { 
                $set: {
                    [`${phaseKey}.meeting_time`]: dateObj,
                    [`${phaseKey}.meeting_link`]: new_meeting_link || undefined,
                    [`${phaseKey}.status`]: 'Scheduled'
                }
            },
            { new: true, returnDocument: 'after' }
        );

        sendEmail({
            email: astrologer.personalDetails.email,
            subject: `Updated: Phase ${phase} Interview Rescheduled`,
            html: `
                <div style="font-family: Arial; border: 1px solid #1a73e8; padding: 20px; border-radius: 10px;">
                    <h2 style="color: #1a73e8;">Interview Rescheduled</h2>
                    <p>Dear <b>${astrologer.personalDetails.name}</b>, your phase ${phase} interview has been moved to a new time.</p>
                    <p><b>New Time:</b> ${indianTimeStr} (IST)</p>
                    <p><b>Link:</b> <a href="${new_meeting_link}">Join Meeting</a></p>
                </div>
            `
        }).catch(err => console.error("Non-blocking Email Error:", err));

        res.status(200).json({ success: true, message: "Rescheduled successfully", data: updatedInterview });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Mark a phase as completed and move to next or final approval
 */
export const markInterviewCompleted = async (req, res) => {
    try {
        const { astrologer_id, phase, remarks, rating } = req.body;

        if (![1, 2, 3].includes(phase)) {
            return res.status(400).json({ success: false, message: "Invalid phase." });
        }

        const interview = await Interview.findOne({ astrologer_id });
        if (!interview) return res.status(404).json({ success: false, message: "Interview record not found" });

        const astrologer = await Astrologer.findById(astrologer_id);
        if (!astrologer) return res.status(404).json({ success: false, message: "Astrologer not found" });

        const phaseKey = `phase${phase}`;
        interview[phaseKey].status = 'Completed';
        interview[phaseKey].remarks = remarks;
        interview[phaseKey].rating = rating;

        let emailSubject = `Phase ${phase} Completed Successfully`;
        let emailMessage = `Congratulations! You have cleared Phase ${phase} of our recruitment process.`;

        if (phase < 3) {
            interview.current_phase = phase + 1;
            emailMessage += ` We will soon schedule your Phase ${phase + 1} interview.`;
        } else {
            // Final Approval Phase
            interview.final_status = 'Approved';
            
            // Generate Random Password for the Astrologer
            const tempPassword = crypto.randomBytes(4).toString('hex'); // 8 characters
            
            const user = await User.findById(astrologer.userId);
            if (user) {
                user.password = tempPassword;
                await user.save();
            }

            await Astrologer.findByIdAndUpdate(astrologer_id, {
                status: 'Approved',
                isApproved: true,
                verificationStatus: 'Verified',
                'systemStatus.isVerified': true
            });

            emailSubject = "Final Approval: Welcome to Astro Marketplace!";
            emailMessage = `
                <p>Excellent news! You have cleared all 3 phases of the interview. Your expert profile is now LIVE.</p>
                <p><b>Your Login Credentials:</b></p>
                <div style="background: #f4f4f4; padding: 10px; border-radius: 5px; margin: 10px 0;">
                    <p style="margin: 5px 0;"><b>User ID (Email):</b> ${astrologer.personalDetails.email}</p>
                    <p style="margin: 5px 0;"><b>Password:</b> ${tempPassword}</p>
                </div>
                <p>Please log in to the Astrologer Panel and change your password immediately.</p>
            `;
        }

        await interview.save();

        sendEmail({
            email: astrologer.personalDetails.email,
            subject: emailSubject,
            html: `
                <div style="font-family: Arial; padding: 20px; border: 1px solid #28a745; border-radius: 10px;">
                    <h2 style="color: #28a745;">Interview Update</h2>
                    <p>Dear <b>${astrologer.personalDetails.name}</b>,</p>
                    <p>${emailMessage}</p>
                    <p>Best Regards,<br>Recruitment Team</p>
                </div>
            `
        }).catch(err => console.error("Non-blocking Email Error:", err));

        res.status(200).json({ success: true, message: `Phase ${phase} completed`, data: interview });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Reject an astrologer during any phase
 */
export const rejectAstrologer = async (req, res) => {
    try {
        const { astrologer_id, phase, reason } = req.body;

        const interview = await Interview.findOneAndUpdate(
            { astrologer_id },
            { 
                $set: { 
                    [`phase${phase}.status`]: 'Rejected',
                    final_status: 'Rejected' 
                } 
            },
            { new: true, returnDocument: 'after' }
        );

        const astrologer = await Astrologer.findByIdAndUpdate(astrologer_id, {
            status: 'Rejected',
            isApproved: false,
            verificationStatus: 'Rejected'
        });

        sendEmail({
            email: astrologer.personalDetails.email,
            subject: 'Application Status Update - Astro Marketplace',
            html: `
                <div style="font-family: Arial; padding: 20px; border: 1px solid #d93025; border-radius: 10px;">
                    <h2 style="color: #d93025;">Application Update</h2>
                    <p>Dear <b>${astrologer.personalDetails.name}</b>,</p>
                    <p>We regret to inform you that we cannot proceed with your application at this time.</p>
                    <p><b>Reason:</b> ${reason || 'Application did not meet our current requirements'}</p>
                    <p>Thank you for your interest.</p>
                </div>
            `
        }).catch(err => console.error("Non-blocking Email Error:", err));

        res.status(200).json({ success: true, message: "Astrologer rejected and notified" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Get interview list by status — includes NEW applicants with no interview record
 */
export const getAstrologersByStatus = async (req, res) => {
    try {
        const { status, search } = req.query;

        console.log('✓ getAstrologersByStatus called with:', { status, search });

        // 1. Build search query for Astrologer collection
        let astroQuery = {};
        if (search) {
            astroQuery.$or = [
                { 'personalDetails.name': { $regex: search, $options: 'i' } },
                { 'personalDetails.email': { $regex: search, $options: 'i' } },
                { 'personalDetails.phone': { $regex: search, $options: 'i' } }
            ];
        }

        // Fetch all matching astrologers
        const astrologers = await Astrologer.find(astroQuery)
            .select('personalDetails createdAt status isApproved')
            .sort({ createdAt: -1 });

        console.log(`✓ Found ${astrologers.length} astrologers matching search`);

        // 2. Fetch interviews for these astrologers
        const astrologerIds = astrologers.map(a => a._id);
        const interviews = await Interview.find({ astrologer_id: { $in: astrologerIds } });

        console.log(`✓ Found ${interviews.length} interview records`);

        // Map interviews by astrologer ID
        const interviewMap = {};
        interviews.forEach(inv => {
            if (inv.astrologer_id) {
                interviewMap[inv.astrologer_id.toString()] = inv;
            }
        });

        // 3. Combine astrologers with their interview status
        const combined = astrologers.map(a => {
            const inv = interviewMap[a._id.toString()];
            if (inv) {
                return {
                    ...inv.toObject(),
                    astrologer_id: a
                };
            } else {
                return {
                    _id: null,
                    astrologer_id: a,
                    current_phase: 0,
                    final_status: 'New',
                    phase1: { status: 'Pending' },
                    phase2: { status: 'Pending' },
                    phase3: { status: 'Pending' },
                    createdAt: a.createdAt
                };
            }
        });

        console.log('✓ Combined records count:', combined.length);
        console.log('✓ Sample statuses:', combined.slice(0, 3).map(c => ({ name: c.astrologer_id?.personalDetails?.name, final_status: c.final_status })));

        // 4. Filter by final_status if requested
        let filtered;
        if (!status || status === 'All') {
            filtered = combined;
            console.log(`✓ Filter: All (${filtered.length} records)`);
        } else if (status === 'Pending') {
            filtered = combined.filter(c => c.final_status === 'Pending' || c.final_status === 'New');
            console.log(`✓ Filter: Pending (${filtered.length} records with status Pending or New)`);
        } else {
            filtered = combined.filter(c => {
                const match = c.final_status === status;
                if (!match) {
                    console.log(`  - Filtered out: final_status="${c.final_status}" !== "${status}"`);
                }
                return match;
            });
            console.log(`✓ Filter: ${status} (${filtered.length} records)`);
        }

        console.log(`✓ Final result: ${filtered.length} records for status="${status}"`);

        res.status(200).json({ success: true, count: filtered.length, data: filtered });
    } catch (error) {
        console.error("✗ Get Astrologers By Status Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};