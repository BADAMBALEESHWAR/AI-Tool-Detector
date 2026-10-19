/** Backend addresses, baked in at build time (see Dockerfile / deploy workflow). */
export const API_BASE: string = import.meta.env.VITE_API_URL || 'https://api.tooldetect.in/api';
export const SOCKET_URL: string = import.meta.env.VITE_SOCKET_URL || API_BASE.replace(/\/api\/?$/, '');
