import pkg from 'agora-access-token';
const { RtcTokenBuilder, RtcRole, RtmTokenBuilder, RtmRole } = pkg;

export const generateRtcToken = async (req, res) => {
    try {
        const appId = process.env.AGORA_APP_ID;
        const appCertificate = process.env.AGORA_APP_CERTIFICATE;
        
        if (!appId || !appCertificate) {
            return res.status(500).json({ error: 'Agora credentials missing' });
        }

        // We can accept channelName from params or body
        const channelName = req.params.channelName || req.body.channelName;
        // User ID for Agora (0 means let Agora assign, or use your string/int ID)
        let uid = req.body.uid || 0; 
        
        // Ensure uid is parsed to an integer if the client passed it as a string but wants an int token
        // Wait, Agora expects integer UID, if string is passed we should use the uid version of string token builder, 
        // but the package usually has buildTokenWithUid (int) and buildTokenWithAccount (string)
        // Let's use buildTokenWithUid and just let client pass 0, which means any uid
        if (typeof uid === 'string') {
            uid = parseInt(uid, 10);
            if (isNaN(uid)) uid = 0;
        }

        // Default role is publisher
        const role = req.body.role === 'audience' ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;

        const expireTime = req.body.expireTime || 3600; // default 1 hour
        const currentTime = Math.floor(Date.now() / 1000);
        const privilegeExpireTime = currentTime + expireTime;

        if (!channelName) {
            return res.status(400).json({ error: 'channelName is required' });
        }

        const token = RtcTokenBuilder.buildTokenWithUid(
            appId,
            appCertificate,
            channelName,
            uid,
            role,
            privilegeExpireTime
        );

        return res.json({ token, channelName, uid });
    } catch (error) {
        console.error("Agora Token Error:", error);
        return res.status(500).json({ error: 'Internal server error while generating token' });
    }
};

export const generateRtmToken = async (req, res) => {
    try {
        const appId = process.env.AGORA_APP_ID;
        const appCertificate = process.env.AGORA_APP_CERTIFICATE;
        
        if (!appId || !appCertificate) {
            return res.status(500).json({ error: 'Agora credentials missing' });
        }

        const account = req.params.account || req.body.account || req.user?._id?.toString();
        
        if (!account) {
            return res.status(400).json({ error: 'account is required for RTM' });
        }

        const expireTime = req.body.expireTime || 3600; 
        const currentTime = Math.floor(Date.now() / 1000);
        const privilegeExpireTime = currentTime + expireTime;

        const token = RtmTokenBuilder.buildToken(
            appId,
            appCertificate,
            account,
            RtmRole.Rtm_User,
            privilegeExpireTime
        );

        return res.json({ token, account });
    } catch (error) {
        console.error("Agora RTM Token Error:", error);
        return res.status(500).json({ error: 'Internal server error while generating RTM token' });
    }
};
