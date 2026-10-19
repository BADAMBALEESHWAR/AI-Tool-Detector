import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

import { authRouter } from './routes/auth';
import { studentRouter } from './routes/student';
import { deviceRouter } from './routes/device';
import { usageRouter } from './routes/usage';
import { toolsRouter } from './routes/tools';
import { adminRouter } from './routes/admin';
import { downloadsRouter } from './routes/downloads';
import { setupSocketIO } from './services/socket';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { prisma } from './utils/prisma';
import { upgradeBuiltinCatalogIfNeeded } from './utils/catalogSync';

dotenv.config();

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const app = express();
const server = http.createServer(app);

// Behind a reverse proxy (Caddy / AWS ALB) req.ip and rate limiting must use
// X-Forwarded-For; TRUST_PROXY is the number of proxy hops in front of the API.
if (process.env.TRUST_PROXY) app.set('trust proxy', parseInt(process.env.TRUST_PROXY, 10));

const isOriginAllowed = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  if (!origin) return callback(null, true);
  if (
    origin.startsWith('chrome-extension://') ||
    origin.startsWith('moz-extension://') ||
    origin === (process.env.FRONTEND_URL || 'http://localhost:5173') ||
    origin === (process.env.ADMIN_URL || 'http://localhost:5174') ||
    origin === (process.env.STUDENT_URL || 'http://localhost:5173') ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:')
  ) {
    return callback(null, true);
  }
  callback(new Error('Not allowed by CORS'));
};

// Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: isOriginAllowed,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

setupSocketIO(io);

// Make io accessible in routes
app.set('io', io);

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin: isOriginAllowed,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/student', studentRouter);
app.use('/api/device', deviceRouter);
app.use('/api/usage', usageRouter);
app.use('/api/tools', toolsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/downloads', downloadsRouter);
app.use('/downloads', downloadsRouter);

// Health check
app.get(['/health', '/api/health'], (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Error Handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start Server ─────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10);
server.listen(PORT, () => {
  logger.info(`🚀 AI Monitor Backend running on port ${PORT}`);
  logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  upgradeBuiltinCatalogIfNeeded(prisma).catch(err => logger.error('Built-in catalog upgrade failed:', err));
});

export { io };
