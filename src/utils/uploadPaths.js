import path from 'path';

/** Normalize multer/legacy DB paths to a web path under /uploads/ */
export const normalizeStoredUploadPath = (stored) => {
    if (!stored) return '';
    let p = String(stored).replace(/\\/g, '/').trim();
    if (!p) return '';
    if (p.startsWith('http://') || p.startsWith('https://')) return p;

    const uploadsIdx = p.indexOf('/uploads/');
    if (uploadsIdx >= 0) return p.slice(uploadsIdx);

    const bareIdx = p.indexOf('uploads/');
    if (bareIdx >= 0) return `/${p.slice(bareIdx)}`;

    if (p.startsWith('/')) return p;
    return `/uploads/${p.replace(/^\/+/, '')}`;
};

export const resolvePublicMediaUrl = (stored, req) => {
    const rel = normalizeStoredUploadPath(stored);
    if (!rel) return '';
    if (rel.startsWith('http')) return rel;

    const base =
        process.env.APP_BASE_URL?.replace(/\/$/, '') ||
        `${req.protocol}://${req.get('host')}`;
    return `${base}${rel.startsWith('/') ? rel : `/${rel}`}`;
};

export const resolveLocalUploadFile = (stored) => {
    const rel = normalizeStoredUploadPath(stored);
    if (!rel || rel.startsWith('http')) return null;
    const relative = rel.replace(/^\//, '');
    return path.join(process.cwd(), relative);
};

export const multerFileToUploadPath = (file) => {
    if (!file) return undefined;
    if (file.filename) return `/uploads/${file.filename}`;
    if (file.path) return normalizeStoredUploadPath(file.path);
    return undefined;
};
