import axios from 'axios';

const baseUrl = 'http://localhost:5001/api/auth';

async function testFlow() {
    try {
        console.log('--- Testing LIVE OTP Flow ---');
        
        const phone = '+918989182028'; // Ensure E.164 format
        
        // 1. Send OTP
        console.log(`Sending OTP to ${phone}...`);
        const sendRes = await axios.post(`${baseUrl}/send-otp`, { phoneNumber: phone });
        console.log('Send Response Success:', sendRes.data.success);
        console.log('Message:', sendRes.data.message);

        console.log('\nSuccess! Check your phone for the SMS.');
        console.log('Once you have the code, you can verify it in the app.');

    } catch (error) {
        console.error('Error:', error.response?.data?.message || error.message);
        if (error.response?.data?.data) {
            console.log('Error details:', error.response.data.data);
        }
    }
}

testFlow();
