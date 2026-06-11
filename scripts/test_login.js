import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:5001/api';

const testLogin = async () => {
    const testCases = [
        // Test astrologer login
        {
            endpoint: '/v1/astrologer/login',
            credentials: {
                email: 'astrologer@gmail.com',
                password: 'Astro@2024'
            },
            role: 'astrologer'
        },
        // Test seller login
        {
            endpoint: '/v1/seller/login',
            credentials: {
                email: 'seller@oneaim.com',
                password: 'password' // You may need to update this
            },
            role: 'seller'
        }
    ];

    console.log(`Testing logins against: ${API_URL}\n`);

    for (const test of testCases) {
        console.log(`=== Testing ${test.role.toUpperCase()} Login ===`);
        console.log(`Endpoint: ${test.endpoint}`);
        console.log(`Email: ${test.credentials.email}`);
        
        try {
            const response = await axios.post(`${API_URL}${test.endpoint}`, test.credentials);
            
            if (response.data.success) {
                console.log('✓ Login successful!');
                console.log(`Token: ${response.data.token || response.data.data?.token || 'N/A'}`);
                console.log(`User ID: ${response.data._id || response.data.data?.id || response.data.data?._id || 'N/A'}`);
            } else {
                console.log('✗ Login failed:', response.data.message);
            }
        } catch (error) {
            console.log('✗ Login error:', error.response?.data?.message || error.message);
            
            if (error.response?.status === 401) {
                console.log('  → Invalid credentials');
            } else if (error.response?.status === 403) {
                console.log('  → Account blocked or wrong app');
            } else if (error.response?.status === 404) {
                console.log('  → User not found');
            }
        }
        
        console.log('---\n');
    }
};

// Run the test
testLogin().catch(console.error);