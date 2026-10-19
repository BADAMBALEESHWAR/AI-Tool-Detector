/** Backend addresses, baked in at build time (see Dockerfile / deploy workflow). */
export const API_BASE: string = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
export const SOCKET_URL: string = import.meta.env.VITE_SOCKET_URL || API_BASE.replace(/\/api\/?$/, '');
/** Where installers and the extension zip are downloaded from (CloudFront in production). */
export const DOWNLOADS_BASE: string = import.meta.env.VITE_DOWNLOADS_URL || `${API_BASE}/downloads`;
