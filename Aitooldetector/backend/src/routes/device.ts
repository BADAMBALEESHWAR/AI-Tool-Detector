import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../utils/prisma';
import { requireStudent, requireAdmin } from '../middleware/auth';
import { emitDeviceActivation } from '../services/socket';
import { logger } from '../utils/logger';

export const deviceRouter = Router();

// POST /api/device/activate — called by desktop app on in-app sign-in
deviceRouter.post(
  '/activate',
  requireStudent,
  [
    body('hostname').trim().notEmpty().withMessage('Hostname required'),
    body('osType').isIn(['WINDOWS', 'MACOS', 'LINUX', 'UNKNOWN']).withMessage('Invalid OS type'),
    body('appVersion').trim().notEmpty().withMessage('App version required'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { hostname, osType, appVersion } = req.body;
    const studentId = req.student!.studentId;
    const sapId = req.student!.sapId;

    try {
      const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { name: true, branch: true, sapId: true },
      });
      if (!student) {
        res.status(404).json({ error: 'Student not found' });
        return;
      }

      // Generate device token (raw — sent to client; hashed version stored in DB)
      const rawToken = uuidv4();
      const tokenHash = await bcrypt.hash(rawToken, 10);

      // Upsert device by the (studentId, hostname) unique constraint.
      // This is atomic at the DB level, so concurrent activation requests
      // for the same device can't create duplicate rows.
      const device = await prisma.device.upsert({
        where: {
          studentId_hostname: { studentId, hostname },
        },
        update: {
          osType,
          appVersion,
          deviceTokenHash: tokenHash,
          status: 'ACTIVE',
          activatedAt: new Date(),
          lastSeen: new Date(),
        },
        create: {
          studentId,
          hostname,
          osType,
          appVersion,
          deviceTokenHash: tokenHash,
          status: 'ACTIVE',
        },
      });

      // Emit activation event
      emitDeviceActivation({
        deviceId: device.id,
        studentId,
        studentName: student.name,
        sapId,
        branch: student.branch,
        osType,
        hostname,
        activatedAt: device.activatedAt.toISOString(),
      });

      logger.info(`Device activated: ${hostname} for student ${sapId}`);

      res.json({
        deviceId: device.id,
        deviceToken: rawToken, // Client stores this raw token
        message: 'Device activated. Monitoring is now active.',
      });
    } catch (err) {
      logger.error('Device activation error:', err);
      res.status(500).json({ error: 'Device activation failed' });
    }
  }
);

// POST /api/device/heartbeat — periodic ping from desktop app/extension
deviceRouter.post('/heartbeat', requireStudent, async (req: Request, res: Response) => {
  const { deviceId, extensionStatus } = req.body;
  const studentId = req.student!.studentId;

  try {
    // Get current app settings
    const settings = await prisma.appSetting.findMany({
      where: {
        key: { in: ['monitoring_enabled', 'monitoring_all_hours', 'monitoring_hours_start', 'monitoring_hours_end', 'session_dedup_minutes', 'tool_sync_interval_minutes'] }
      }
    });
    const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));

    if (!deviceId) {
      res.status(400).json({ error: 'deviceId required' });
      return;
    }

    const device = await prisma.device.findFirst({
      where: { id: deviceId, studentId },
    });
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    await prisma.device.update({
      where: { id: deviceId },
      data: {
        lastSeen: new Date(),
        extensionStatus: extensionStatus ?? device.extensionStatus,
      },
    });

    res.json({
      ok: true,
      settings: settingsMap,
      monitoringActive: settingsMap.monitoring_enabled === 'true',
    });
  } catch (err) {
    logger.error('Heartbeat error:', err);
    res.status(500).json({ error: 'Heartbeat failed' });
  }
});

// POST /api/device/deactivate — student logout from app
deviceRouter.post('/deactivate', requireStudent, async (req: Request, res: Response) => {
  const { deviceId } = req.body;
  const studentId = req.student!.studentId;

  try {
    const device = await prisma.device.findFirst({
      where: { id: deviceId, studentId },
    });
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    await prisma.device.update({
      where: { id: deviceId },
      data: { status: 'INACTIVE' },
    });

    res.json({ message: 'Device deactivated. Monitoring paused.' });
  } catch {
    res.status(500).json({ error: 'Deactivation failed' });
  }
});

// PATCH /api/device/:id/force-deactivate — admin only
deviceRouter.patch('/:id/force-deactivate', requireAdmin, async (req: Request, res: Response) => {
  try {
    const device = await prisma.device.findUnique({ where: { id: req.params.id } });
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    await prisma.device.update({
      where: { id: req.params.id },
      data: { status: 'DEACTIVATED' },
    });
    res.json({ message: 'Device force-deactivated by admin' });
  } catch {
    res.status(500).json({ error: 'Force deactivation failed' });
  }
});
