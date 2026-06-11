import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;

const twilioBaseUrl = `https://verify.twilio.com/v2/Services/${VERIFY_SERVICE_SID}/Verifications`;
const twilioCheckUrl = `https://verify.twilio.com/v2/Services/${VERIFY_SERVICE_SID}/VerificationCheck`;

const formatPhoneNumber = (phone) => {
    if (!phone) return phone;
    let formatted = phone.replace(/\s+/g, ''); // Remove spaces
    if (!formatted.startsWith('+')) {
        // If it starts with 0, remove it
        if (formatted.startsWith('0')) formatted = formatted.substring(1);
        // If it doesn't have 91 at start, add it. If it has 91 but no +, add +
        if (!formatted.startsWith('91')) {
            formatted = '+91' + formatted;
        } else {
            formatted = '+' + formatted;
        }
    }
    return formatted;
};

const getAuthHeader = () => {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    return Buffer.from(`${sid}:${token}`).toString('base64');
};

export const sendOTP = async (phoneNumber) => {
    try {
        const auth = getAuthHeader();
        const formattedPhone = formatPhoneNumber(phoneNumber);
        const response = await axios.post(
            twilioBaseUrl,
            new URLSearchParams({
                To: formattedPhone,
                Channel: 'sms',
            }).toString(),
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error sending OTP:', error.response?.data || error.message);
        throw new Error(error.response?.data?.message || 'Failed to send OTP');
    }
};

export const verifyOTP = async (phoneNumber, code) => {
    try {
        const auth = getAuthHeader();
        const formattedPhone = formatPhoneNumber(phoneNumber);
        const response = await axios.post(
            twilioCheckUrl,
            new URLSearchParams({
                To: formattedPhone,
                Code: code,
            }).toString(),
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error verifying OTP:', error.response?.data || error.message);
        throw new Error(error.response?.data?.message || 'Failed to verify OTP');
    }
};
