const http = require('http');

async function testAuthBug() {
    // 1. Create a seller
    const sellerData = JSON.stringify({
        ownerName: 'Test Seller',
        email: 'testseller1@test.com',
        phone: '1234567899',
        password: 'sellerpassword',
        storeName: 'Test Store'
    });

    const createSellerReq = http.request({
        hostname: 'localhost',
        port: 5001,
        path: '/api/v1/seller/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': sellerData.length }
    }, res => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
            console.log('Seller Created:', res.statusCode, body);
            
            // 2. Try to login as astrologer using seller credentials
            const loginData = JSON.stringify({
                email: 'testseller1@test.com',
                password: 'sellerpassword' // correct password for the seller
            });

            const loginReq = http.request({
                hostname: 'localhost',
                port: 5001,
                path: '/api/v1/astrologer/login',
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': loginData.length }
            }, loginRes => {
                let loginBody = '';
                loginRes.on('data', d => loginBody += d);
                loginRes.on('end', () => {
                    console.log('Seller login as astrologer attempt:', loginRes.statusCode, loginBody);
                    
                    // 3. Try to login with random password
                    const randLoginData = JSON.stringify({
                        email: 'testseller1@test.com',
                        password: 'randompassword123'
                    });

                    const randLoginReq = http.request({
                        hostname: 'localhost',
                        port: 5001,
                        path: '/api/v1/astrologer/login',
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Content-Length': randLoginData.length }
                    }, randLoginRes => {
                        let randLoginBody = '';
                        randLoginRes.on('data', d => randLoginBody += d);
                        randLoginRes.on('end', () => {
                            console.log('Random password attempt:', randLoginRes.statusCode, randLoginBody);
                        });
                    });
                    randLoginReq.write(randLoginData);
                    randLoginReq.end();
                });
            });
            loginReq.write(loginData);
            loginReq.end();
        });
    });
    createSellerReq.write(sellerData);
    createSellerReq.end();
}

testAuthBug();
