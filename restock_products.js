import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './src/models/Product.js';
import connectDB from './src/config/db.js';

dotenv.config();

const restock = async () => {
    try {
        await connectDB();
        console.log('Connected to MongoDB');

        const result = await Product.updateMany(
            { $or: [{ stock: { $lte: 0 } }, { stock: { $exists: false } }] },
            { $set: { stock: 50 } }
        );

        console.log(`Updated ${result.modifiedCount} products with stock = 50`);
        process.exit(0);
    } catch (error) {
        console.error('Restock failed:', error);
        process.exit(1);
    }
};

restock();
