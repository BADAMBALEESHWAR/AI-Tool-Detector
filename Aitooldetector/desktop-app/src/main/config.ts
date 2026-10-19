/**
 * Backend address. Override for local development with MAIN_VITE_API_BASE in
 * desktop-app/.env (e.g. MAIN_VITE_API_BASE=http://localhost:3001/api).
 */
export const API_BASE: string = import.meta.env.MAIN_VITE_API_BASE || 'https://api.tooldetect.in/api';
export const SOCKET_URL = API_BASE.replace(/\/api\/?$/, '');
