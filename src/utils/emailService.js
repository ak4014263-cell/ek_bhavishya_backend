import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendEmail = async ({ to, subject, html }) => {
    let lastError = null;

    // Send email exclusively via Resend
    if (process.env.RESEND_API_KEY) {
        try {
            console.log(`[EmailService] Attempting to send email via Resend to ${to}`);
            const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
            const { data, error } = await resend.emails.send({
                from,
                to,
                subject,
                html,
            });

            if (error) {
                console.error('[EmailService] Resend Error:', error);
                lastError = error;
            } else {
                console.log(`[EmailService] Email sent successfully via Resend to ${to}`, data);
                return { success: true, data };
            }
        } catch (error) {
            console.error('[EmailService] Resend Unexpected Error:', error);
            lastError = error;
        }
    } else {
        console.error('[EmailService] RESEND_API_KEY is not defined in environment variables.');
        lastError = new Error('RESEND_API_KEY is missing');
    }

    return { 
        success: false, 
        message: 'Email sending failed', 
        error: lastError?.message || lastError 
    };
};

export const sendOtpEmail = async (to, otp) => {
    const subject = 'Your One-Time Password (OTP) - Ek Bhavishya';
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #6a1b9a; text-align: center;">Ek Bhavishya</h2>
            <p>Hello,</p>
            <p>Your verification code is:</p>
            <div style="background-color: #f3e5f5; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #4a148c; border-radius: 5px; margin: 20px 0;">
                ${otp}
            </div>
            <p>This OTP is valid for 10 minutes. Please do not share this code with anyone.</p>
            <p>If you did not request this code, please ignore this email.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="font-size: 12px; color: #999; text-align: center;">&copy; 2026 Ek Bhavishya. All rights reserved.</p>
        </div>
    `;
    return sendEmail({ to, subject, html });
};
