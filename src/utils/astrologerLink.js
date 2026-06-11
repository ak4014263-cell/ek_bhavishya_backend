import User from '../models/User.js';
import Astrologer from '../models/Astrologer.js';

const emailRegex = (email) => {
    const escaped = String(email).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}$`, 'i');
};

const isApproved = (astrologer) =>
    astrologer?.status === 'Approved' ||
    astrologer?.isApproved === true ||
    astrologer?.systemStatus?.isApproved === true;

/**
 * Finds an astrologer for a logged-in user and repairs missing userId / role links.
 */
export const resolveAstrologerForUser = async (user) => {
    if (!user?._id) return null;

    // Never attach astrologer data to admin/seller accounts
    if (['admin', 'seller'].includes(user.role)) return null;

    let astrologer = await Astrologer.findOne({ userId: user._id });

    if (!astrologer && user.email) {
        astrologer = await Astrologer.findOne({
            'personalDetails.email': emailRegex(user.email),
        });
    }

    if (!astrologer) return null;

    let dirty = false;

    if (!astrologer.userId || astrologer.userId.toString() !== user._id.toString()) {
        astrologer.userId = user._id;
        dirty = true;
    }

    if (user.email && astrologer.personalDetails?.email !== user.email) {
        astrologer.personalDetails = astrologer.personalDetails || {};
        astrologer.personalDetails.email = user.email;
        dirty = true;
    }

    if (user.role !== 'astrologer' && !['admin', 'seller'].includes(user.role)) {
        user.role = 'astrologer';
        await user.save();
    }

    if (isApproved(astrologer)) {
        if (astrologer.status !== 'Approved') {
            astrologer.status = 'Approved';
            dirty = true;
        }
        if (!astrologer.systemStatus) astrologer.systemStatus = {};
        if (!astrologer.systemStatus.isApproved) {
            astrologer.systemStatus.isApproved = true;
            dirty = true;
        }
        if (astrologer.isApproved !== true) {
            astrologer.isApproved = true;
            dirty = true;
        }
    }

    if (dirty) await astrologer.save();

    return astrologer;
};

/**
 * Ensures a User account exists for an astrologer (e.g. after admin approval).
 */
export const ensureUserForAstrologer = async (astrologer) => {
    if (!astrologer) return null;

    const email = astrologer.personalDetails?.email?.trim();
    const phone = astrologer.personalDetails?.phone?.trim();
    const name = astrologer.personalDetails?.name || 'Astrologer';

    let user = null;
    if (astrologer.userId) {
        user = await User.findById(astrologer.userId);
    }
    if (!user && email) {
        user = await User.findOne({ email: emailRegex(email) });
    }
    if (!user && phone) {
        user = await User.findOne({ phoneNumber: phone });
    }

    if (user) {
        if (['admin', 'seller'].includes(user.role)) {
            return user;
        }
        if (user.role !== 'astrologer') {
            user.role = 'astrologer';
            await user.save();
        }
    } else if (email) {
        user = await User.create({
            fullName: name,
            email,
            phoneNumber: phone || undefined,
            role: 'astrologer',
        });
    }

    if (user && (!astrologer.userId || astrologer.userId.toString() !== user._id.toString())) {
        astrologer.userId = user._id;
        await astrologer.save();
    }

    return user;
};

export const findAstrologerByIdentifier = async (identifier) => {
    if (!identifier) return null;
    const trimmed = String(identifier).trim();
    if (trimmed.includes('@')) {
        return Astrologer.findOne({ 'personalDetails.email': emailRegex(trimmed) });
    }
    let astro = await Astrologer.findOne({ 'personalDetails.phone': trimmed });
    if (!astro) {
        const digits = trimmed.replace(/\D/g, '');
        if (digits.length >= 10) {
            astro = await Astrologer.findOne({
                'personalDetails.phone': { $regex: `${digits.slice(-10)}$` },
            });
        }
    }
    return astro;
};

export const findUserByIdentifier = async (identifier) => {
    if (!identifier) return null;
    const trimmed = String(identifier).trim();
    if (trimmed.includes('@')) {
        return User.findOne({ email: emailRegex(trimmed) });
    }
    let user = await User.findOne({ phoneNumber: trimmed });
    if (user) return user;
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length >= 10) {
        user = await User.findOne({
            phoneNumber: { $regex: `${digits.slice(-10)}$` },
        });
    }
    return user;
};

/** Resolve user + astrologer row for login (repairs orphan / legacy links). */
export const resolveLoginAstrologer = async (identifier) => {
    let user = await findUserByIdentifier(identifier);
    let astrologer = null;

    if (!user) {
        astrologer = await findAstrologerByIdentifier(identifier);
        if (astrologer?.userId) {
            user = await User.findById(astrologer.userId);
        }
    }

    if (user && !['admin', 'seller'].includes(user.role)) {
        astrologer = await resolveAstrologerForUser(user);
    }

    if (user && !astrologer && user.role === 'astrologer') {
        astrologer = await getOrCreateAstrologerForUser(user);
    }

    return { user, astrologer };
};

/** Create or link astrologer profile for a user with role astrologer. */
export const getOrCreateAstrologerForUser = async (user) => {
    if (!user?._id) return null;
    if (['admin', 'seller'].includes(user.role)) return null;

    let astrologer = await Astrologer.findOne({ userId: user._id });
    if (astrologer) return astrologer;

    if (user.email) {
        astrologer = await Astrologer.findOne({
            'personalDetails.email': emailRegex(user.email),
        });
        if (astrologer) {
            astrologer.userId = user._id;
            astrologer.personalDetails = astrologer.personalDetails || {};
            if (!astrologer.personalDetails.name) {
                astrologer.personalDetails.name = user.fullName || 'Astrologer';
            }
            astrologer.personalDetails.email = user.email;
            await astrologer.save();
            return astrologer;
        }
    }

    // Generate unique phone if not provided (to avoid unique constraint violation)
    const uniquePhone = user.phoneNumber || `temp-${user._id.toString()}-${Date.now()}`;

    astrologer = await Astrologer.create({
        userId: user._id,
        personalDetails: {
            name: user.fullName || 'Astrologer',
            email: user.email,
            phone: uniquePhone,
        },
        status: 'Pending',
        systemStatus: { isApproved: false, isOnline: false },
    });
    return astrologer;
};

/** Normalize stored file paths for clients (profile, blog, course images). */
export const normalizeMediaPath = (url) => {
    if (!url) return null;
    let path = String(url).replace(/\\/g, '/').trim();
    if (!path) return null;
    if (path.startsWith('http')) return path;
    if (!path.startsWith('/')) path = `/${path}`;
    return path;
};

export { isApproved };
