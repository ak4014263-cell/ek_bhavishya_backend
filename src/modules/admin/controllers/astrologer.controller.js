import Astrologer from '../../../models/Astrologer.js';
import WalletTransaction from '../../../models/Transaction.js';
import Interview from '../models/InterviewModel.js';
import { ensureUserForAstrologer, resolveAstrologerForUser } from '../../../utils/astrologerLink.js';

const getTopAstrologers = async (req, res) => {
	try {
		const { startDate, endDate, limit = 10, sortBy = 'revenue' } = req.query;

		console.log('=== Top Astrologers Request ===');
		console.log('Query params:', { startDate, endDate, limit, sortBy });

		// Default to last 30 days
		const end = endDate ? new Date(endDate) : new Date();
		const start = startDate ? new Date(startDate) : new Date();
		if (!startDate) start.setDate(end.getDate() - 30);

		start.setHours(0, 0, 0, 0);
		end.setHours(23, 59, 59, 999);

		console.log('Date range:', { start, end });

		const query = {
			type: 'credit',
			createdAt: {
				$gte: start,
				$lte: end,
			},
		};

		// Count transactions for debugging
		const transactionCount = await WalletTransaction.countDocuments(query);
		console.log('Matching wallet transactions:', transactionCount);

		if (transactionCount === 0) {
			console.log('No transactions found in date range');
			return res.status(200).json({ 
				success: true, 
				data: [],
				message: 'No transactions found in the specified date range'
			});
		}

		// Define sort order based on sortBy parameter
		let sortOrder = { revenue: -1 };
		if (sortBy === 'rating') sortOrder = { 'astrologerDetails.ratings.average': -1 };
		else if (sortBy === 'appointments') sortOrder = { appointmentCount: -1 };
		else if (sortBy === 'reviews') sortOrder = { 'astrologerDetails.ratings.count': -1 };

		const topAstrologers = await WalletTransaction.aggregate([
			{ $match: query },
			{
				$group: {
					_id: '$astrologerId',
					totalRevenue: { $sum: '$amount' },
					transactionCount: { $sum: 1 },
					averageTransaction: { $avg: '$amount' },
				},
			},
			{
				$lookup: {
					from: 'astrologers',
					localField: '_id',
					foreignField: '_id',
					as: 'astrologerDetails',
				},
			},
			{ $unwind: { path: '$astrologerDetails', preserveNullAndEmptyArrays: true } },
			{
				$addFields: {
					appointmentCount: '$transactionCount',
					averageRating: { $ifNull: ['$astrologerDetails.ratings.average', 0] },
					totalReviews: { $ifNull: ['$astrologerDetails.ratings.count', 0] },
				},
			},
			{ $sort: sortOrder },
			{ $limit: parseInt(limit) || 10 },
			{
				$project: {
					_id: 1,
					astrologerId: '$_id',
					name: '$astrologerDetails.personalDetails.name',
					pseudonym: '$astrologerDetails.personalDetails.pseudonym',
					email: '$astrologerDetails.personalDetails.email',
					profileImage: '$astrologerDetails.personalDetails.profileImage',
					experience: '$astrologerDetails.personalDetails.experience',
					languages: '$astrologerDetails.personalDetails.languages',
					skills: '$astrologerDetails.personalDetails.skills',
					revenue: '$totalRevenue',
					appointmentCount: '$transactionCount',
					averageRevenuPerAppointment: '$averageTransaction',
					rating: '$averageRating',
					reviewCount: '$totalReviews',
					isApproved: '$astrologerDetails.isApproved',
					isOnline: '$astrologerDetails.systemStatus.isOnline',
					pricing: '$astrologerDetails.pricing',
					availability: '$astrologerDetails.availability',
					rank: { $add: ['$rank', 1] }, // Will be added by client ranking
				},
			},
		]);

		// Add ranking
		const rankedAstrologers = topAstrologers.map((astrologer, index) => ({
			...astrologer,
			rank: index + 1,
		}));

		console.log('Successfully retrieved top astrologers:', rankedAstrologers.length);

		res.status(200).json({ 
			success: true, 
			data: rankedAstrologers,
			pagination: {
				total: rankedAstrologers.length,
				limit: parseInt(limit) || 10,
			},
			dateRange: {
				start: start.toISOString(),
				end: end.toISOString(),
			},
			sortedBy: sortBy,
		});
	} catch (error) {
		console.error('Get Top Astrologers Error:', error);
		console.error('Error stack:', error.stack);
		res.status(500).json({ 
			success: false, 
			message: 'Internal Server Error',
			error: error.message,
			details: process.env.NODE_ENV === 'development' ? error.stack : undefined
		});
	}
};

const suspendAstrologer = async (req, res) => {
	try {
		const { id, suspensionReason } = req.body;
		if (!id) return res.status(400).json({ success: false, message: 'ID is required' });

		// Find astrologer first to update all fields properly
		const astrologer = await Astrologer.findById(id);
		if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found.' });

		// Turn off approval
		astrologer.isApproved = false;
		astrologer.status = 'Suspended';
		astrologer.suspensionReason = suspensionReason || 'Suspended by admin';
		astrologer.suspendedAt = new Date();

		// DISABLE ALL SERVICES
		// 1. Chat service OFF
		astrologer.availability.isChatAvailable = false;
		// 2. Call service OFF
		astrologer.availability.isCallAvailable = false;
		// 3. Video service OFF
		astrologer.availability.isVideoAvailable = false;
		// 4. Set status to offline
		astrologer.availability.status = 'offline';
		astrologer.availability.currentStatus = 'offline';
		// 5. Turn off live status
		astrologer.systemStatus.isLive = false;
		astrologer.systemStatus.isOnline = false;

		// Record suspension in rejection details for logging
		astrologer.rejectionDetails = { 
			date: new Date(),
			reason: suspensionReason || 'Suspended by admin'
		};

		const updatedAstrologer = await astrologer.save();

		res.status(200).json({
			success: true,
			message: 'Astrologer suspended successfully. All services (Chat, Call, Video) disabled.',
			astrologer: {
				id: updatedAstrologer._id,
				name: updatedAstrologer.personalDetails.name,
				status: updatedAstrologer.status,
				isApproved: updatedAstrologer.isApproved,
				suspendedAt: updatedAstrologer.suspendedAt,
				suspensionReason: updatedAstrologer.suspensionReason,
				availability: {
					isChatAvailable: updatedAstrologer.availability.isChatAvailable,
					isCallAvailable: updatedAstrologer.availability.isCallAvailable,
					isVideoAvailable: updatedAstrologer.availability.isVideoAvailable,
					status: updatedAstrologer.availability.status
				}
			}
		});
	} catch (error) {
		console.error('Suspend Astrologer Error:', error);
		res.status(500).json({ success: false, message: 'Internal Server Error', error: error.message });
	}
};

const unsuspendAstrologer = async (req, res) => {
	try {
		const { id, unsuspensionNotes } = req.body;
		if (!id) return res.status(400).json({ success: false, message: 'ID is required' });

		// Find astrologer first
		const astrologer = await Astrologer.findById(id);
		if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found.' });

		// Check if astrologer is actually suspended
		if (astrologer.status !== 'Suspended') {
			return res.status(400).json({ 
				success: false, 
				message: `Astrologer is not suspended. Current status: ${astrologer.status}` 
			});
		}

		// Re-enable approval
		astrologer.isApproved = true;
		astrologer.status = 'Approved';
		astrologer.suspensionReason = null;
		astrologer.unsuspendedAt = new Date();
		if (unsuspensionNotes) astrologer.unsuspensionNotes = unsuspensionNotes;

		// RE-ENABLE SERVICES (back to what they were before)
		// Note: You might want to store previous availability state before suspending
		// For now, we'll enable all services
		astrologer.availability.isChatAvailable = true;
		astrologer.availability.isCallAvailable = true;
		astrologer.availability.isVideoAvailable = true;
		astrologer.availability.status = 'offline'; // Let them manually set to online
		astrologer.availability.currentStatus = 'offline';
		// systemStatus can be set to false initially, let them come online manually
		astrologer.systemStatus.isLive = false;
		astrologer.systemStatus.isOnline = false;

		// Clear rejection details
		astrologer.rejectionDetails = null;

		const updatedAstrologer = await astrologer.save();

		res.status(200).json({
			success: true,
			message: 'Astrologer unsuspended successfully. All services re-enabled.',
			astrologer: {
				id: updatedAstrologer._id,
				name: updatedAstrologer.personalDetails.name,
				status: updatedAstrologer.status,
				isApproved: updatedAstrologer.isApproved,
				unsuspendedAt: updatedAstrologer.unsuspendedAt,
				unsuspensionNotes: updatedAstrologer.unsuspensionNotes,
				availability: {
					isChatAvailable: updatedAstrologer.availability.isChatAvailable,
					isCallAvailable: updatedAstrologer.availability.isCallAvailable,
					isVideoAvailable: updatedAstrologer.availability.isVideoAvailable,
					status: updatedAstrologer.availability.status
				}
			}
		});
	} catch (error) {
		console.error('Unsuspend Astrologer Error:', error);
		res.status(500).json({ success: false, message: 'Internal Server Error', error: error.message });
	}
};

/**
 * =========================================
 * GET ALL ASTROLOGERS
 * =========================================
 * 
 * @description Retrieves a list of all astrologers with pagination and filtering
 * @route       GET /api/v1/admin/astrologers
 * @access      Private (Admin Only)
 */
const getAllAstrologers = async (req, res) => {
	try {
		const page = parseInt(req.query.page, 10) || 1;
		const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
		const skip = (page - 1) * limit;
		const { search, isApproved, status } = req.query;

		// Build query
		const query = {};
		if (isApproved !== undefined) {
			const isAppVal = isApproved === 'true';
			query.$or = [
				{ isApproved: isAppVal },
				{ 'systemStatus.isApproved': isAppVal }
			];
		}
		if (status) {
			query.status = { $regex: new RegExp(`^${status}$`, 'i') };
		}
		if (search) {
			query.$or = query.$or || [];
			query.$or.push(
				{ 'personalDetails.name': { $regex: search, $options: 'i' } },
				{ 'personalDetails.pseudonym': { $regex: search, $options: 'i' } },
				{ 'personalDetails.email': { $regex: search, $options: 'i' } },
				{ 'personalDetails.phone': { $regex: search, $options: 'i' } }
			);
		}

		const astrologers = await Astrologer.aggregate([
			{ $match: query },
			{ $sort: { createdAt: -1 } },
			{ $skip: skip },
			{ $limit: limit },
			{
				$lookup: {
					from: 'chatsessions',
					localField: '_id',
					foreignField: 'astrologerId',
					as: 'chats'
				}
			},
			{
				$lookup: {
					from: 'transactions',
					localField: '_id',
					foreignField: 'astrologerId',
					as: 'txns'
				}
			},
			{
				$lookup: {
					from: 'interviews',
					localField: '_id',
					foreignField: 'astrologer_id',
					as: 'interview'
				}
			},
			{
				$addFields: {
					interviewData: { $arrayElemAt: ['$interview', 0] }
				}
			},
			{
				$project: {
					_id: 1,
					name: '$personalDetails.name',
					email: '$personalDetails.email',
					phone: '$personalDetails.phone',
					profileImage: '$personalDetails.profileImage',
					status: '$status',
					isApproved: { $ifNull: ['$isApproved', '$systemStatus.isApproved'] },
					isOnline: '$systemStatus.isOnline',
					rating: { $ifNull: ['$ratings.average', 0.0] },
					specializations: { $concatArrays: [{ $ifNull: ['$personalDetails.skills', []] }, { $ifNull: ['$personalDetails.categories', []] }] },
					sessions: { $size: '$chats' },
					earnings: { $sum: '$txns.amount' },
					pricePerMin: { $ifNull: ['$pricing.chat', 0] },
					interviewStatus: { $ifNull: ['$interviewData.final_status', 'Not Started'] },
					interviewPhase: { $ifNull: ['$interviewData.current_phase', 0] },
					isVerified: { $ifNull: ['$systemStatus.isVerified', false] },
					pricingUpdateRequest: '$pricingUpdateRequest',
					rejectionReason: { $ifNull: ['$rejectionReason', null] },
					certificates: { $ifNull: ['$certificates', []] },
					documents: {
						aadhar: '$documents.aadharCard',
						pan: '$documents.panCard',
						certificates: '$documents.educationalCertificates',
						interviewDocs: '$documents.interviewDocuments'
					},
					experience: { $ifNull: ['$personalDetails.experience', 0] },
					languages: { $ifNull: ['$personalDetails.languages', []] },
					bio: { $ifNull: ['$profileEnhancement.bio', ''] },
					pricing: { $ifNull: ['$pricing', { chat: 0, call: 0, video: 0 }] }
				}
			}
		]);

		const total = await Astrologer.countDocuments(query);

		res.status(200).json({
			success: true,
			data: astrologers,
			pagination: {
				total,
				page,
				limit,
				pages: Math.ceil(total / limit)
			}
		});
	} catch (error) {
		console.error('Get All Astrologers Error:', error);
		res.status(500).json({ success: false, message: 'Internal Server Error' });
	}
};

const editAstrologer = async (req, res) => {
	try {
		const { id } = req.params;
		if (!id) return res.status(400).json({ success: false, message: 'ID is required' });

		console.log(`[editAstrologer] Request to edit astrologer ID: ${id}`);
		console.log('[editAstrologer] req.body:', JSON.stringify(req.body, null, 2));

		const astrologer = await Astrologer.findById(id);
		if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found.' });

		// Update personalDetails fields
		const { 
			name, 
			email, 
			phone, 
			phoneNumber, 
			profileImage, 
			gender, 
			dob, 
			experience, 
			languages, 
			skills, 
			pseudonym, 
			about,
			bio,
			videoIntro,
			voiceMessage,
			verificationStatus,
			isApproved,
			status,
			rejectionReason,
			// Pricing
			callPrice,
			chatPrice,
			videoPrice,
			// Call settings
			audioCallRate,
			videoCallRate,
			acceptAudioCalls,
			acceptVideoCalls,
			// Availability
			isChatAvailable,
			isCallAvailable,
			isVideoAvailable,
			// Address (if needs to be editable)
			addressLine,
			city,
			state,
			zip
		} = req.body;

		// Initialize nested properties safely if they do not exist
		if (!astrologer.personalDetails) astrologer.personalDetails = {};
		if (!astrologer.profileEnhancement) astrologer.profileEnhancement = {};
		if (!astrologer.pricing) astrologer.pricing = { chat: 0, call: 0, video: 0 };
		if (!astrologer.callSettings) astrologer.callSettings = { audioCallRate: 0, videoCallRate: 0, acceptAudioCalls: true, acceptVideoCalls: true };
		if (!astrologer.availability) astrologer.availability = { isChatAvailable: true, isCallAvailable: true, isVideoAvailable: true };
		if (!astrologer.addressDetails) astrologer.addressDetails = {};

		// Update personalDetails
		if (name !== undefined) astrologer.personalDetails.name = name;
		if (email !== undefined) astrologer.personalDetails.email = email;
		if (phone !== undefined || phoneNumber !== undefined) astrologer.personalDetails.phone = phone || phoneNumber;
		if (profileImage !== undefined) astrologer.personalDetails.profileImage = profileImage;
		if (gender !== undefined) astrologer.personalDetails.gender = gender;
		if (dob !== undefined) astrologer.personalDetails.dob = dob;
		if (experience !== undefined) astrologer.personalDetails.experience = experience;
		if (languages !== undefined) astrologer.personalDetails.languages = languages;
		if (skills !== undefined) astrologer.personalDetails.skills = skills;
		if (pseudonym !== undefined) astrologer.personalDetails.pseudonym = pseudonym;
		if (about !== undefined) astrologer.personalDetails.about = about;

		// Update profileEnhancement
		if (bio !== undefined) astrologer.profileEnhancement.bio = bio;
		if (videoIntro !== undefined) astrologer.profileEnhancement.videoIntro = videoIntro;
		if (voiceMessage !== undefined) astrologer.profileEnhancement.voiceMessage = voiceMessage;

		// Update verification and approval
		if (verificationStatus !== undefined) astrologer.verificationStatus = verificationStatus;
		if (isApproved !== undefined) astrologer.isApproved = isApproved;
		if (status !== undefined) astrologer.status = status;
		if (rejectionReason !== undefined) astrologer.rejectionReason = rejectionReason;

		// Update pricing (handle both formats: chatPrice/callPrice/videoPrice and chat/call/video)
		const chatVal = chatPrice !== undefined ? chatPrice : req.body.chat;
		const callVal = callPrice !== undefined ? callPrice : req.body.call;
		const videoVal = videoPrice !== undefined ? videoPrice : req.body.video;

		if (chatVal !== undefined) {
			console.log(`[editAstrologer] Updating chat price to: ${chatVal}`);
			astrologer.pricing.chat = Number(chatVal);
			astrologer.markModified('pricing.chat');
		}
		if (callVal !== undefined) {
			console.log(`[editAstrologer] Updating call price to: ${callVal}`);
			astrologer.pricing.call = Number(callVal);
			astrologer.markModified('pricing.call');
		}
		if (videoVal !== undefined) {
			console.log(`[editAstrologer] Updating video price to: ${videoVal}`);
			astrologer.pricing.video = Number(videoVal);
			astrologer.markModified('pricing.video');
		}
		
		if (chatVal !== undefined || callVal !== undefined || videoVal !== undefined) {
			astrologer.markModified('pricing');
		}

		// Update call settings
		if (audioCallRate !== undefined) astrologer.callSettings.audioCallRate = audioCallRate;
		if (videoCallRate !== undefined) astrologer.callSettings.videoCallRate = videoCallRate;
		if (acceptAudioCalls !== undefined) astrologer.callSettings.acceptAudioCalls = acceptAudioCalls;
		if (acceptVideoCalls !== undefined) astrologer.callSettings.acceptVideoCalls = acceptVideoCalls;

		// Update availability
		if (isChatAvailable !== undefined) astrologer.availability.isChatAvailable = isChatAvailable;
		if (isCallAvailable !== undefined) astrologer.availability.isCallAvailable = isCallAvailable;
		if (isVideoAvailable !== undefined) astrologer.availability.isVideoAvailable = isVideoAvailable;

		// Update address details (if editable by admin)
		if (addressLine !== undefined) astrologer.addressDetails.addressLine = addressLine;
		if (city !== undefined) astrologer.addressDetails.city = city;
		if (state !== undefined) astrologer.addressDetails.state = state;
		if (zip !== undefined) astrologer.addressDetails.zip = zip;

		// Handle document uploads
		if (req.files) {
			if (req.files['aadharCard']) {
				if (!astrologer.documents) astrologer.documents = {};
				astrologer.documents.aadharCard = req.files['aadharCard'][0].path;
			}
			if (req.files['panCard']) {
				if (!astrologer.documents) astrologer.documents = {};
				astrologer.documents.panCard = req.files['panCard'][0].path;
			}
			if (req.files['educationalCertificates']) {
				if (!astrologer.documents) astrologer.documents = {};
				astrologer.documents.educationalCertificates = req.files['educationalCertificates'].map(file => file.path);
			}
		}

		// Handle profile image upload
		if (req.files && req.files['profileImage']) {
			astrologer.personalDetails.profileImage = req.files['profileImage'][0].path;
		}

		const updatedAstrologer = await astrologer.save();
		console.log('[editAstrologer] Successfully updated and saved astrologer in database:', JSON.stringify(updatedAstrologer.pricing, null, 2));

		res.status(200).json({
			success: true,
			message: 'Astrologer updated successfully.',
			astrologer: updatedAstrologer
		});
	} catch (error) {
		console.error('Edit Astrologer Error:', error);
		res.status(500).json({ success: false, message: 'Internal Server Error' });
	}
};

const deleteAstrologer = async (req, res) => {
	try {
		const { id } = req.params;
		if (!id) return res.status(400).json({ success: false, message: 'ID is required' });

		const astrologer = await Astrologer.findById(id);
		if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found.' });

		// Delete associated User document if userId exists
		if (astrologer.userId) {
			const User = (await import('../../../models/User.js')).default;
			await User.findByIdAndDelete(astrologer.userId);
		}

		await Astrologer.findByIdAndDelete(id);

		res.status(200).json({
			success: true,
			message: 'Astrologer deleted successfully.',
			astrologer
		});
	} catch (error) {
		console.error('Delete Astrologer Error:', error);
		res.status(500).json({ success: false, message: 'Internal Server Error' });
	}
};

const approveAstrologer = async (req, res) => {
	try {
		const id = req.params.id || req.body.id;
		if (!id) return res.status(400).json({ success: false, message: 'ID is required' });

		const astrologer = await Astrologer.findById(id);
		if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found.' });

		// ENFORCE: Interview must be fully completed before approval
		const interview = await Interview.findOne({ astrologer_id: id });
		if (!interview || interview.final_status !== 'Approved') {
			const phase = interview ? interview.current_phase : 0;
			const phaseStatus = interview ? interview.final_status : 'Not Started';
			return res.status(403).json({
				success: false,
				message: `Cannot approve astrologer. Interview process not completed. Current status: ${phaseStatus} (Phase ${phase}/3). All 3 interview phases must be passed first.`,
				interviewStatus: phaseStatus,
				currentPhase: phase
			});
		}

		astrologer.isApproved = true;
		astrologer.status = 'Approved';
		astrologer.approvedAt = astrologer.approvedAt || new Date();
		astrologer.rejectionReason = null;
		if (!astrologer.systemStatus) astrologer.systemStatus = {};
		astrologer.systemStatus.isApproved = true;

		await ensureUserForAstrologer(astrologer);
		const updatedAstrologer = await astrologer.save();

		res.status(200).json({ success: true, message: 'Astrologer approved successfully.', astrologer: updatedAstrologer });
	} catch (error) {
		console.error('Approve Astrologer Error:', error);
		res.status(500).json({ success: false, message: 'Internal Server Error' });
	}
};

const rejectAstrologer = async (req, res) => {
	try {
		const id = req.params.id || req.body.id;
		const { reason } = req.body;
		if (!id) return res.status(400).json({ success: false, message: 'ID is required' });

		const astrologer = await Astrologer.findById(id);
		if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found.' });

		const updatedAstrologer = await Astrologer.findByIdAndUpdate(id, {
			isApproved: false,
			status: 'Rejected',
			rejectionReason: reason || 'Application rejected'
		}, { new: true });

		res.status(200).json({ success: true, message: 'Astrologer rejected successfully.', astrologer: updatedAstrologer });
	} catch (error) {
		console.error('Reject Astrologer Error:', error);
		res.status(500).json({ success: false, message: 'Internal Server Error' });
	}
};

/** Link astrologer profile ↔ user account by email (fixes missing dashboard data). */
const syncAstrologerUserAccount = async (req, res) => {
	try {
		const email = (req.body?.email || req.query?.email || '').trim();
		if (!email) {
			return res.status(400).json({ success: false, message: 'email is required' });
		}

		const astrologer = await Astrologer.findOne({
			'personalDetails.email': new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
		});
		if (!astrologer) {
			return res.status(404).json({ success: false, message: 'No astrologer found for this email' });
		}

		const user = await ensureUserForAstrologer(astrologer);
		if (!user) {
			return res.status(400).json({ success: false, message: 'Could not create or link user account' });
		}

		await resolveAstrologerForUser(user);

		res.status(200).json({
			success: true,
			message: 'Astrologer account linked successfully',
			data: {
				userId: user._id,
				email: user.email,
				role: user.role,
				astrologerId: astrologer._id,
				status: astrologer.status,
				isApproved: astrologer.isApproved,
			},
		});
	} catch (error) {
		console.error('syncAstrologerUserAccount error:', error);
		res.status(500).json({ success: false, message: error.message });
	}
};

const astrologerController = {
	suspendAstrologer,
	unsuspendAstrologer,
	getTopAstrologers,
	getAllAstrologers,
	editAstrologer,
	deleteAstrologer,
	approveAstrologer,
	rejectAstrologer,
	syncAstrologerUserAccount,
};

export default astrologerController;

