import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { prisma } from '../utils/prisma';
import { requireStudent } from '../middleware/auth';

export const studentRouter = Router();

// All student routes require auth
studentRouter.use(requireStudent);

// GET /api/student/profile
studentRouter.get('/profile', async (req: Request, res: Response) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.student!.studentId },
      select: {
        id: true,
        sapId: true,
        name: true,
        branch: true,
        email: true,
        status: true,
        registeredAt: true,
      },
    });
    if (!student) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }
    res.json(student);
  } catch {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// GET /api/student/devices
studentRouter.get('/devices', async (req: Request, res: Response) => {
  try {
    const devices = await prisma.device.findMany({
      where: { studentId: req.student!.studentId },
      select: {
        id: true,
        osType: true,
        hostname: true,
        appVersion: true,
        extensionStatus: true,
        status: true,
        activatedAt: true,
        lastSeen: true,
      },
      orderBy: { activatedAt: 'desc' },
    });
    res.json(devices);
  } catch {
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// GET /api/student/usage?page=1&limit=20&toolId=&source=&from=&to=
studentRouter.get('/usage', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const { toolId, source, from, to } = req.query;

  const where: any = { studentId: req.student!.studentId };
  if (toolId) where.toolId = toolId;
  if (source) where.source = source;
  if (from || to) {
    where.startTime = {};
    if (from) where.startTime.gte = new Date(from as string);
    if (to) where.startTime.lte = new Date(to as string);
  }

  try {
    const [events, total] = await Promise.all([
      prisma.usageEvent.findMany({
        where,
        include: {
          tool: { select: { id: true, name: true, type: true } },
          device: { select: { osType: true, hostname: true } },
        },
        orderBy: { startTime: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.usageEvent.count({ where }),
    ]);

    res.json({
      events,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch usage history' });
  }
});

// GET /api/student/stats - summary stats for own dashboard
studentRouter.get('/stats', async (req: Request, res: Response) => {
  try {
    const studentId = req.student!.studentId;
    const [totalEvents, totalDuration, topTools, recentEvents] = await Promise.all([
      prisma.usageEvent.count({ where: { studentId } }),
      prisma.usageEvent.aggregate({
        where: { studentId },
        _sum: { durationSeconds: true },
      }),
      prisma.usageEvent.groupBy({
        by: ['toolName'],
        where: { studentId },
        _count: { toolName: true },
        _sum: { durationSeconds: true },
        orderBy: { _count: { toolName: 'desc' } },
        take: 5,
      }),
      prisma.usageEvent.findMany({
        where: { studentId },
        orderBy: { startTime: 'desc' },
        take: 5,
        select: {
          toolName: true,
          startTime: true,
          durationSeconds: true,
          source: true,
        },
      }),
    ]);

    res.json({
      totalEvents,
      totalDurationSeconds: totalDuration._sum.durationSeconds || 0,
      topTools,
      recentEvents,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// PATCH /api/student/change-password — self-service, requires current password
studentRouter.patch(
  '/change-password',
  [
    body('currentPassword').notEmpty().withMessage('Current password required'),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { currentPassword, newPassword } = req.body;
    try {
      const student = await prisma.student.findUnique({ where: { id: req.student!.studentId } });
      if (!student) {
        res.status(404).json({ error: 'Student not found' });
        return;
      }

      const valid = await bcrypt.compare(currentPassword, student.passwordHash);
      if (!valid) {
        res.status(401).json({ error: 'Current password is incorrect' });
        return;
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await prisma.student.update({
        where: { id: student.id },
        data: { passwordHash },
      });

      res.json({ message: 'Password changed successfully' });
    } catch {
      res.status(500).json({ error: 'Failed to change password' });
    }
  }
);
