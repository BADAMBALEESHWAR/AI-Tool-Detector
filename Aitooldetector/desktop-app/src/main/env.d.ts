/// <reference types="electron-vite/node" />

interface ImportMetaEnv {
  /** Backend API base URL override for development, e.g. http://localhost:3001/api */
  readonly MAIN_VITE_API_BASE?: string;
}
