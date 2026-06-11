import bcrypt from 'bcryptjs';

const testPassword = 'TestPass@123';

(async () => {
    try {
        console.log('Original password:', testPassword);
        
        // Simulate what pre-save hook does
        const hashed = await bcrypt.hash(testPassword, 10);
        console.log('Hashed password:', hashed);
        
        // Simulate what comparePassword does
        const isMatch = await bcrypt.compare(testPassword, hashed);
        console.log('Password match:', isMatch);
        
        // Try with wrong password
        const wrongMatch = await bcrypt.compare('WrongPassword', hashed);
        console.log('Wrong password match:', wrongMatch);
        
        console.log('\n✓ bcrypt working correctly');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
})();