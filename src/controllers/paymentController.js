import Razorpay from 'razorpay';
import crypto from 'crypto';

// Determine which Razorpay keys to use based on the environment
const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
const RAZORPAY_KEY_ID = isDevelopment ? process.env.RAZORPAY_KEY_ID_TEST : process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = isDevelopment ? process.env.RAZORPAY_KEY_SECRET_TEST : process.env.RAZORPAY_KEY_SECRET;

export const createOrder = async (req, res) => {
    try {
        const { amount, currency = 'INR', receipt } = req.body;
        
        if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
            return res.status(500).json({ success: false, message: 'Razorpay keys are not configured for this environment' });
        }

        const razorpay = new Razorpay({
            key_id: RAZORPAY_KEY_ID,
            key_secret: RAZORPAY_KEY_SECRET,
        });

        const options = {
            amount: amount * 100, // amount in smallest currency unit (paise)
            currency,
            receipt: receipt || `receipt_${Date.now()}`
        };

        const order = await razorpay.orders.create(options);

        if (!order) {
            return res.status(500).json({ success: false, message: 'Error creating Razorpay order' });
        }

        res.status(200).json({ success: true, order });
    } catch (error) {
        console.error('Razorpay Create Order Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Missing Razorpay payment details' });
        }

        // Use the selected secret key for verification
        const sign = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSign = crypto
            .createHmac("sha256", RAZORPAY_KEY_SECRET)
            .update(sign.toString())
            .digest("hex");

        if (razorpay_signature === expectedSign) {
            // Payment is verified
            res.status(200).json({ success: true, message: 'Payment verified successfully' });
        } else {
            res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }
    } catch (error) {
        console.error('Razorpay Verify Payment Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
