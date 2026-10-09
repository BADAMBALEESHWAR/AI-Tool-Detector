import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyStudentSocketToken, verifyAdminSocketToken } from '../middleware/auth';
import { logger } from '../utils/logger';

// Global io reference for use in routes
let _io: SocketIOServer;

export function setupSocketIO(io: SocketIOServer) {
  _io = io;

  io.use(async (socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string;
    const role = socket.handshake.auth?.role as string;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    if (role === 'admin') {
      const admin = await verifyAdminSocketToken(token);
      if (!admin) return next(new Error('Invalid admin token'));
      (socket as any).adminData = admin;
      (socket as any).role = 'admin';
    } else {
      const student = await verifyStudentSocketToken(token);
      if (!student) return next(new Error('Invalid student token'));
      (socket as any).studentData = student;
      (socket as any).role = 'student';
    }

    next();
  });

  io.on('connection', (socket: Socket) => {
    const role = (socket as any).role;

    if (role === 'admin') {
      socket.join('admin-room');
      logger.info(`Admin connected: ${(socket as any).adminData?.email}`);
      socket.emit('connected', { message: 'Connected to admin room' });
    } else {
      const student = (socket as any).studentData;
      socket.join(`student-${student.sapId}`);
      logger.info(`Student connected: ${student.sapId}`);
      socket.emit('connected', { message: 'Connected to student room' });
    }

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id} (${role})`);
    });
  });

  logger.info('Socket.IO configured');
}

// ── Event Emitters ──────────────────────────────────────────────────────────

export interface UsageNotification {
  eventId: string;
  studentId: string;
  studentName: string;
  sapId: string;
  branch: string;
  toolName: string;
  toolId?: string;
  source: string;
  deviceHostname?: string;
  browserName?: string;
  startTime: string;
  endTime?: string;
  durationSeconds?: number;
  rawIdentifier?: string;
  isUnknownTool: boolean;
  eventType?: 'ACTIVE' | 'DEACTIVATED';
  sessionKey?: string;
}

export interface PendingToolNotification {
  toolId: string;
  suggestedName: string;
  pattern: string;
  reportCount: number;
  firstDetectedAt: string;
}

export interface DeviceActivationNotification {
  deviceId: string;
  studentId: string;
  studentName: string;
  sapId: string;
  branch: string;
  osType: string;
  hostname: string;
  activatedAt: string;
}

export function emitUsageEvent(notification: UsageNotification) {
  if (!_io) return;
  _io.to('admin-room').emit('usage:new', notification);
  _io.to(`student-${notification.sapId}`).emit('usage:own', notification);
  if (notification.eventType === 'ACTIVE') {
    _io.to('admin-room').emit('usage:active', notification);
  } else if (notification.eventType === 'DEACTIVATED') {
    _io.to('admin-room').emit('usage:deactivated', notification);
  }
  logger.info(`Emitted usage:new (${notification.eventType || 'EVENT'}) for ${notification.sapId} → ${notification.toolName}${notification.durationSeconds ? ` (${notification.durationSeconds}s)` : ''}`);
}

export function emitPendingTool(notification: PendingToolNotification) {
  if (!_io) return;
  _io.to('admin-room').emit('tool:pending', notification);
  logger.info(`Emitted tool:pending → ${notification.suggestedName}`);
}

export function emitDeviceActivation(notification: DeviceActivationNotification) {
  if (!_io) return;
  _io.to('admin-room').emit('device:activated', notification);
  _io.to(`student-${notification.sapId}`).emit('device:activated', notification);
  logger.info(`Emitted device:activated for ${notification.sapId}`);
}

export function emitSettingsUpdated(settings: Record<string, string>) {
  if (!_io) return;
  _io.to('admin-room').emit('settings:updated', settings);
  _io.emit('settings:sync', settings);
  logger.info('Emitted settings:updated to connected clients');
}

export function emitToolsUpdated() {
  if (!_io) return;
  _io.to('admin-room').emit('tools:updated');
  _io.emit('tools:sync');
  logger.info('Emitted tools:updated to connected clients');
}

export function getIO() {
  return _io;
}

