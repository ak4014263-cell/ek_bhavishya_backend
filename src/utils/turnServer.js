import * as crypto from 'node:crypto';

/**
 * Generate TURN server credentials (long-term credential mechanism)
 * @param {string} username - User ID or unique identifier
 * @param {string} secret - TURN server secret key
 * @param {number} ttl - Time to live in seconds (default 24h)
 * @returns {Object} { username, credential }
 */
export const generateTurnCredentials = (username, secret, ttl = 86400) => {
    const unixTimestamp = Math.floor(Date.now() / 1000) + ttl;
    const turnUsername = `${unixTimestamp}:${username}`;
    
    const hmac = crypto.createHmac('sha1', secret);
    hmac.update(turnUsername);
    const credential = hmac.digest('base64');
    
    return {
        username: turnUsername,
        credential
    };
};

/**
 * Get ICE servers configuration
 * @returns {Array} Array of ICE server configurations
 */
export const getIceServers = (userId) => {
    const turnSecret = process.env.TURN_SECRET;
    const turnUrl = process.env.TURN_URL; // e.g. "turn:your-turn-server.com:3478"
    const stunUrl = process.env.STUN_URL || "stun:stun.l.google.com:19302";

    const iceServers = [
        { urls: stunUrl }
    ];

    if (turnSecret && turnUrl) {
        const { username, credential } = generateTurnCredentials(userId, turnSecret);
        iceServers.push({
            urls: [turnUrl],
            username,
            credential
        });
    }

    return iceServers;
};
