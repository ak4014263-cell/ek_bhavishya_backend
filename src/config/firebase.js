import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

let app;

if (!admin.apps.length) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY 
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
        : undefined;

    app = admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
        }),
    });
    console.log('[Firebase] Initialized successfully');
} else {
    app = admin.app();
}

export const messaging = admin.messaging();
export default app;
