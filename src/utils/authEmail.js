/**
 * Normalize email for storage/lookup (case-insensitive login).
 */
export const normalizeEmail = (email) => {
    if (email == null || typeof email !== 'string') return null;
    const trimmed = email.trim();
    if (!trimmed.includes('@')) return trimmed;
    return trimmed.toLowerCase();
};

/** Case-insensitive exact email match for MongoDB queries. */
export const emailLookupRegex = (email) => {
    const norm = normalizeEmail(email);
    if (!norm) return null;
    const escaped = norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}$`, 'i');
};
