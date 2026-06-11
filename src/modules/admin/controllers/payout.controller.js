import WalletTransaction from '../../../models/Transaction.js';
import Astrologer from '../../../models/Astrologer.js';
import Seller from '../../../models/Seller.js';

/**
 * GET /admin/payouts
 * Lists astrologer payout requests (withdrawals / debit transactions)
 */
const getPayouts = async (req, res) => {
	try {
		const { page = 1, limit = 20, status } = req.query;
		const skip = (page - 1) * limit;

		const query = { type: 'debit', referenceType: 'Withdrawal' };
		if (status && status !== 'all') query.status = status;

		const [txns, total] = await Promise.all([
			WalletTransaction.find(query)
				.populate({
					path: 'astrologerId',
					select: 'personalDetails bankDetails userId',
					populate: { path: 'userId', select: 'fullName email' },
				})
				.populate({
					path: 'sellerId',
					select: 'business_name fullname storeName bank_holder_name bank_account_no ifsc_code',
				})
				.populate({
					path: 'userId',
					select: 'fullName email phoneNumber',
				})
				.sort({ createdAt: -1 })
				.skip(parseInt(skip))
				.limit(parseInt(limit))
				.lean(),
			WalletTransaction.countDocuments(query),
		]);

		const formatBank = (bankDetails, seller) => {
			if (bankDetails?.bankName || bankDetails?.accountNumber) {
				const name = bankDetails.bankName || 'Bank';
				const acct = bankDetails.accountNumber
					? `****${String(bankDetails.accountNumber).slice(-4)}`
					: 'N/A';
				return `${name} - ${acct}`;
			}
			if (seller?.bank_holder_name || seller?.bank_account_no) {
				const acct = seller.bank_account_no
					? `****${String(seller.bank_account_no).slice(-4)}`
					: '';
				return `${seller.bank_holder_name || 'Account'}${acct ? ' - ' + acct : ''}`;
			}
			return 'N/A';
		};

		const resolveRecipient = (t) => {
			if (t.astrologerId && typeof t.astrologerId === 'object') {
				const a = t.astrologerId;
				return (
					a.personalDetails?.name ||
					a.personalDetails?.pseudonym ||
					a.userId?.fullName ||
					a.userId?.email ||
					'Astrologer'
				);
			}
			if (t.sellerId && typeof t.sellerId === 'object') {
				const s = t.sellerId;
				return s.business_name || s.fullname || s.storeName || 'Seller';
			}
			if (t.userId && typeof t.userId === 'object') {
				const u = t.userId;
				return u.fullName || u.email || u.phoneNumber || 'User';
			}
			return 'Unknown Payout Recipient';
		};

		const data = txns.map((t) => {
			const name = resolveRecipient(t);
			const bank = formatBank(
				t.astrologerId?.bankDetails,
				typeof t.sellerId === 'object' ? t.sellerId : null
			);
			return {
				...t,
				astrologer: name,
				astrologerName: name,
				bank,
				bankAccount: bank,
				requestedAt: t.createdAt,
				utr: t.paymentGatewayId || (t.referenceId ? String(t.referenceId) : null),
			};
		});

		res.status(200).json({
			success: true,
			data,
			pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
		});
	} catch (error) {
		console.error('Get Payouts Error:', error);
		res.status(500).json({ success: false, message: 'Internal Server Error' });
	}
};

/**
 * PATCH /admin/payouts/:id/status
 * Update payout status (pending → processing → paid / rejected)
 */
const updatePayoutStatus = async (req, res) => {
	try {
		const { id } = req.params;
		const { status } = req.body;

		if (!id || !status) {
			return res.status(400).json({ success: false, message: 'ID and status are required' });
		}

		const allowed = ['pending', 'processing', 'paid', 'rejected'];
		if (!allowed.includes(status)) {
			return res.status(400).json({ success: false, message: `Status must be one of: ${allowed.join(', ')}` });
		}

		const txn = await WalletTransaction.findById(id);
		if (!txn) return res.status(404).json({ success: false, message: 'Payout not found.' });

		const oldStatus = txn.status;
		txn.status = status;
		await txn.save();

		// If rejected, refund locked balance to astrologer or seller
		if (status === 'rejected' && oldStatus !== 'rejected') {
			if (txn.astrologerId) {
				const astrologer = await Astrologer.findById(txn.astrologerId);
				if (astrologer) {
					astrologer.walletBalance = (astrologer.walletBalance || 0) + txn.amount;
					await astrologer.save();

					await WalletTransaction.create({
						astrologerId: astrologer._id,
						amount: txn.amount,
						type: 'credit',
						status: 'completed',
						description: `Refund for rejected withdrawal request: ${txn._id}`,
						referenceId: txn._id,
						referenceType: 'Withdrawal',
					});
				}
			} else if (txn.sellerId) {
				const seller = await Seller.findById(txn.sellerId);
				if (seller) {
					seller.walletBalance = (seller.walletBalance || 0) + txn.amount;
					await seller.save();

					await WalletTransaction.create({
						sellerId: seller._id,
						amount: txn.amount,
						type: 'credit',
						status: 'completed',
						description: `Refund for rejected withdrawal request: ${txn._id}`,
						referenceId: txn._id,
						referenceType: 'Withdrawal',
					});
				}
			}
		}

		res.status(200).json({ success: true, message: `Payout status updated to ${status}.`, data: txn });
	} catch (error) {
		console.error('Update Payout Status Error:', error);
		res.status(500).json({ success: false, message: 'Internal Server Error' });
	}
};

const payoutController = { getPayouts, updatePayoutStatus };
export default payoutController;
