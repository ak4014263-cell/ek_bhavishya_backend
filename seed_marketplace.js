import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Remedy from './src/models/Remedy.js';
import Product from './src/models/Product.js';
import Astrologer from './src/models/Astrologer.js';
import Seller from './src/models/Seller.js';

dotenv.config();

const seed = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Check for an astrologer to link to
        let astrologer = await Astrologer.findOne();
        if (!astrologer) {
            console.log('No astrologer found, creating one...');
            astrologer = await Astrologer.create({
                personalDetails: { name: 'Expert Astrologer', email: 'expert@test.com', phone: '1234567890' },
                isOnline: true,
                rating: 4.8,
                totalOrders: 150
            });
        }

        // Check for a seller to link to
        let seller = await Seller.findOne();
        if (!seller) {
            console.log('No seller found, creating one...');
            seller = await Seller.create({
                business_name: 'Astro Gem Store',
                email: 'store@test.com'
            });
        }

        // Seed Remedies if empty
        const remedyCount = await Remedy.countDocuments();
        if (remedyCount === 0) {
            console.log('Seeding remedies...');
            await Remedy.create([
                {
                    title: 'Sun Planetary Remedy',
                    description: 'Strengthen your Sun with this Vedic ritual.',
                    base_price: 501,
                    type: 'planetary',
                    astrologerId: astrologer._id,
                    image: 'https://picsum.photos/400/300?sig=1'
                },
                {
                    title: 'Wealth Prosperity Pooja',
                    description: 'Attract abundance and financial stability.',
                    base_price: 1100,
                    type: 'general',
                    astrologerId: astrologer._id,
                    image: 'https://picsum.photos/400/300?sig=2'
                }
            ]);
        }

        // Seed Products if empty
        const productCount = await Product.countDocuments();
        if (productCount === 0) {
            console.log('Seeding products...');
            await Product.create([
                {
                    product_name: 'Natural Blue Sapphire',
                    description: 'A premium quality Neelam stone for Saturn strength.',
                    base_price: 4500,
                    selling_price: 4999,
                    product_images: ['https://picsum.photos/400/300?sig=3'],
                    seller_id: seller._id,
                    stock: 10,
                    category: 'Planets'
                },
                {
                    product_name: 'Silver Gemstone Ring',
                    description: 'Beautifully crafted ring for your lucky stone.',
                    base_price: 1200,
                    selling_price: 1500,
                    product_images: ['https://picsum.photos/400/300?sig=4'],
                    seller_id: seller._id,
                    stock: 25,
                    category: 'Rings'
                }
            ]);
        }

        console.log('Seeding complete');
        process.exit(0);
    } catch (error) {
        console.error('Seeding failed:', error);
        process.exit(1);
    }
};

seed();
