import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';

export interface StudentTokenPayload {
  studentId: string;
  sapId: string;
  role: 'student';
}

export interface AdminTokenPayload {
  adminId: string;
  email: string;
  role: 'admin' | 'superadmin';
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      student?: StudentTokenPayload;
      admin?: AdminTokenPayload;
      deviceToken?: string;
    }
  }
}

export function generateStudentTokens(payload: Omit<StudentTokenPayload, 'role'>) {
  const accessToken = jwt.sign(
    { ...payload, role: 'student' },
    process.env.JWT_SECRET as string,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' } as jwt.SignOptions
  );
  const refreshToken = jwt.sign(
    { ...payload, role: 'student' },
    process.env.JWT_REFRESH_SECRET as string,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' } as jwt.SignOptions
  );
  return { accessToken, refreshToken };
}

export function generateAdminToken(payload: Omit<AdminTokenPayload, 'role'> & { role: string }) {
  return jwt.sign(
    payload,
    process.env.ADMIN_JWT_SECRET as string,
    { expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '8h' } as jwt.SignOptions
  );
}

// ── Middleware ─────────────────────────────────────────────────────────────

export function requireStudent(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as StudentTokenPayload;
    if (payload.role !== 'student') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    req.student = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Admin authentication required' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.ADMIN_JWT_SECRET as string) as AdminTokenPayload;
    if (payload.role !== 'admin' && payload.role !== 'superadmin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired admin token' });
  }
}

// Device token auth (for desktop app / extension API calls)
export function requireDeviceToken(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers['x-device-token'] as string;
  if (!token) {
    res.status(401).json({ error: 'Device token required' });
    return;
  }
  // Validate token exists in DB (checked in route handler)
  req.deviceToken = token;
  next();
}

// Socket.IO auth helpers
export async function verifyStudentSocketToken(token: string): Promise<StudentTokenPayload | null> {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as StudentTokenPayload;
    const student = await prisma.student.findUnique({ where: { id: payload.studentId } });
    if (!student || student.status !== 'ACTIVE') return null;
    return payload;
  } catch {
    return null;
  }
}

export async function verifyAdminSocketToken(token: string): Promise<AdminTokenPayload | null> {
  try {
    const payload = jwt.verify(token, process.env.ADMIN_JWT_SECRET as string) as AdminTokenPayload;
    const admin = await prisma.adminUser.findUnique({ where: { id: payload.adminId } });
    if (!admin) return null;
    return payload;
  } catch {
    return null;
  }
}
