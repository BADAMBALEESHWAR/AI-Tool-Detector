import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { prisma } from '../utils/prisma';
import { generateStudentTokens, generateAdminToken } from '../middleware/auth';
import { logger } from '../utils/logger';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Student Signup ──────────────────────────────────────────────────────────
authRouter.post(
  '/signup',
  authLimiter,
  [
    body('sapId').trim().notEmpty().withMessage('SAP ID is required'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('branch').trim().notEmpty().withMessage('Branch is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
    body('email').optional().isEmail().withMessage('Invalid email'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { sapId, name, branch, email, password } = req.body;

    try {
      // Check if already registered by SAP ID
      const existing = await prisma.student.findUnique({ where: { sapId } });
      if (existing) {
        res.status(409).json({ error: 'An account with this SAP ID already exists.' });
        return;
      }

      // Check if email already registered (if provided)
      if (email) {
        const existingEmail = await prisma.student.findUnique({ where: { email } });
        if (existingEmail) {
          res.status(409).json({ error: 'An account with this email already exists.' });
          return;
        }
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const student = await prisma.student.create({
        data: {
          sapId,
          name,
          branch,
          email: email || null,
          passwordHash,
        },
      });

      const tokens = generateStudentTokens({ studentId: student.id, sapId: student.sapId });

      logger.info(`Student registered: ${sapId}`);
      res.status(201).json({
        message: 'Account created successfully',
        student: {
          id: student.id,
          sapId: student.sapId,
          name: student.name,
          branch: student.branch,
        },
        ...tokens,
      });
    } catch (err) {
      logger.error('Signup error:', err);
      res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  }
);

// ── Student Signin ──────────────────────────────────────────────────────────
authRouter.post(
  '/signin',
  authLimiter,
  [
    body('sapId').trim().notEmpty().withMessage('SAP ID is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { sapId, password } = req.body;

    try {
      const student = await prisma.student.findUnique({ where: { sapId } });
      if (!student) {
        res.status(401).json({ error: 'Invalid SAP ID or password.' });
        return;
      }
      if (student.status !== 'ACTIVE') {
        res.status(403).json({ error: 'Your account has been suspended. Contact admin.' });
        return;
      }

      const valid = await bcrypt.compare(password, student.passwordHash);
      if (!valid) {
        res.status(401).json({ error: 'Invalid SAP ID or password.' });
        return;
      }

      const tokens = generateStudentTokens({ studentId: student.id, sapId: student.sapId });

      logger.info(`Student signed in: ${sapId}`);
      res.json({
        student: {
          id: student.id,
          sapId: student.sapId,
          name: student.name,
          branch: student.branch,
          email: student.email,
        },
        ...tokens,
      });
    } catch (err) {
      logger.error('Signin error:', err);
      res.status(500).json({ error: 'Sign-in failed. Please try again.' });
    }
  }
);

// ── Token Refresh ───────────────────────────────────────────────────────────
authRouter.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ error: 'Refresh token required' });
    return;
  }

  try {
    const payload = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET as string
    ) as { studentId: string; sapId: string };

    const student = await prisma.student.findUnique({ where: { id: payload.studentId } });
    if (!student || student.status !== 'ACTIVE') {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    const tokens = generateStudentTokens({ studentId: student.id, sapId: student.sapId });
    res.json(tokens);
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// ── Admin Setup Status ───────────────────────────────────────────────────────
// Lets the login page offer first-run account creation only while no admin exists.
authRouter.get('/admin/setup-status', async (_req: Request, res: Response) => {
  try {
    const count = await prisma.adminUser.count({ where: { status: 'active' } });
    res.json({ setupRequired: count === 0 });
  } catch (err) {
    logger.error('Admin setup-status error:', err);
    res.status(500).json({ error: 'Failed to read setup status.' });
  }
});

/** Returns true when the request carries a valid token for a current superadmin. */
async function isSuperadminRequest(req: Request): Promise<boolean> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return false;
  try {
    const payload = jwt.verify(header.slice(7), process.env.ADMIN_JWT_SECRET as string) as { adminId?: string };
    if (!payload.adminId) return false;
    // Role comes from the database, not the token, so demoted admins lose access immediately.
    const admin = await prisma.adminUser.findUnique({ where: { id: payload.adminId } });
    return admin?.role === 'superadmin' && admin.status === 'active';
  } catch {
    return false;
  }
}

// ── Admin Signup ─────────────────────────────────────────────────────────────
// The very first account becomes an active superadmin. After that:
//   - a signed-in superadmin creates active admin accounts directly;
//   - anyone else creates a PENDING request that cannot sign in until a superadmin approves it.

authRouter.post(
  '/admin/signup',
  authLimiter,
  [
    body('name').trim().notEmpty().withMessage('Full name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email address required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array(), error: errors.array()[0].msg });
      return;
    }

    const { name, email, password } = req.body;

    try {
      const count = await prisma.adminUser.count({ where: { status: 'active' } });
      const direct = count === 0 || (await isSuperadminRequest(req));

      const existing = await prisma.adminUser.findUnique({ where: { email } });
      if (existing) {
        res.status(409).json({ error: 'An administrator account with this email already exists.' });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const role = count === 0 ? 'superadmin' : 'admin';
      const status = direct ? 'active' : 'pending';

      const admin = await prisma.adminUser.create({
        data: {
          name,
          email,
          passwordHash,
          role,
          status,
        },
      });

      if (!direct) {
        logger.info(`Admin access requested: ${email}`);
        res.status(202).json({
          pending: true,
          message: 'Request submitted. A superadmin must approve it before you can sign in.',
        });
        return;
      }

      logger.info(`New Admin account created: ${email} (${role})`);
      res.status(201).json({
        message: 'Admin account created successfully! Please sign in with your credentials.',
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
        },
      });
    } catch (err) {
      logger.error('Admin signup error:', err);
      res.status(500).json({ error: 'Failed to create administrator account. Please try again.' });
    }
  }
);

// ── Admin Signin ─────────────────────────────────────────────────────────────
authRouter.post(
  '/admin/signin',
  authLimiter,
  [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array(), error: errors.array()[0].msg });
      return;
    }

    const { email, password } = req.body;

    try {
      const admin = await prisma.adminUser.findUnique({ where: { email } });
      if (!admin) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const valid = await bcrypt.compare(password, admin.passwordHash);
      if (!valid) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }
      if (admin.status !== 'active') {
        res.status(403).json({ error: 'Your access request is awaiting superadmin approval.' });
        return;
      }

      const token = generateAdminToken({
        adminId: admin.id,
        email: admin.email,
        role: admin.role,
      });

      logger.info(`Admin signed in: ${email}`);
      res.json({
        admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
        token,
      });
    } catch (err) {
      logger.error('Admin signin error:', err);
      res.status(500).json({ error: 'Sign-in failed.' });
    }
  }
);

