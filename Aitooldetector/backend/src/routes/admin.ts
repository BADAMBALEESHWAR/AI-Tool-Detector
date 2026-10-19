import { Router, Request, Response } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import { prisma } from '../utils/prisma';
import { requireAdmin } from '../middleware/auth';
import { logger } from '../utils/logger';
import { emitSettingsUpdated } from '../services/socket';
import { getActiveSessions } from '../services/activeSessions';

export const adminRouter = Router();

// All admin routes require admin auth
adminRouter.use(requireAdmin);

const upload = multer({
  dest: path.join(process.cwd(), 'uploads'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted'));
    }
  },
});

// ── Master List ──────────────────────────────────────────────────────────────

// POST /api/admin/master-list — upload CSV
adminRouter.post(
  '/master-list',
  upload.single('csv'),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'No CSV file provided' });
      return;
    }

    try {
      const content = fs.readFileSync(req.file.path, 'utf-8');
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      if (!records.length) {
        res.status(400).json({ error: 'CSV is empty' });
        return;
      }

      // Detect column names (case-insensitive)
      const firstRow = records[0];
      const keys = Object.keys(firstRow).map(k => k.toLowerCase());
      const sapIdCol = Object.keys(firstRow).find(k =>
        ['sap_id', 'sapid', 'sap id', 'id'].includes(k.toLowerCase())
      );
      const nameCol = Object.keys(firstRow).find(k =>
        ['name', 'student_name', 'full_name'].includes(k.toLowerCase())
      );
      const branchCol = Object.keys(firstRow).find(k =>
        ['branch', 'class', 'department', 'div', 'division'].includes(k.toLowerCase())
      );

      if (!sapIdCol || !nameCol) {
        res.status(400).json({
          error: 'CSV must have columns: SAP_ID, Name (and optionally Branch/Class)',
          detected: keys,
        });
        return;
      }

      let imported = 0;
      let skipped = 0;

      for (const record of records) {
        const sapId = record[sapIdCol]?.trim();
        const name = record[nameCol]?.trim();
        const branch = branchCol ? record[branchCol]?.trim() || 'Unknown' : 'Unknown';

        if (!sapId || !name) { skipped++; continue; }

        await prisma.studentMasterEntry.upsert({
          where: { sapId },
          update: { name, branch },
          create: { sapId, name, branch },
        });
        imported++;
      }

      // Clean up temp file
      fs.unlinkSync(req.file.path);

      logger.info(`Master list uploaded: ${imported} entries by ${req.admin!.email}`);
      res.json({ message: 'Master list uploaded', imported, skipped });
    } catch (err: any) {
      logger.error('Master list upload error:', err);
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: 'Failed to process CSV: ' + err.message });
    }
  }
);

// GET /api/admin/master-list — list entries
adminRouter.get('/master-list', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(200, parseInt(req.query.limit as string) || 50);
  const search = req.query.search as string;

  const where: any = search
    ? {
        OR: [
          { sapId: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { branch: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

  try {
    const [entries, total] = await Promise.all([
      prisma.studentMasterEntry.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { sapId: 'asc' },
      }),
      prisma.studentMasterEntry.count({ where }),
    ]);
    res.json({ entries, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch {
    res.status(500).json({ error: 'Failed to fetch master list' });
  }
});

// ── Students ─────────────────────────────────────────────────────────────────

// GET /api/admin/students
adminRouter.get('/students', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const search = req.query.search as string;
  const status = req.query.status as string;

  const where: any = {};
  if (search) {
    where.OR = [
      { sapId: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
      { branch: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (status) where.status = status;

  try {
    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where,
        include: {
          devices: {
            select: { id: true, osType: true, hostname: true, status: true, lastSeen: true, extensionStatus: true },
            orderBy: { lastSeen: 'desc' },
            take: 3,
          },
          _count: { select: { usageEvents: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { registeredAt: 'desc' },
      }),
      prisma.student.count({ where }),
    ]);

    res.json({
      students: students.map(s => ({
        ...s,
        passwordHash: undefined, // never expose
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});



// GET /api/admin/students/:id — full student detail
adminRouter.get('/students/:id', async (req: Request, res: Response) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: {
        devices: {
          orderBy: { lastSeen: 'desc' },
        },
        _count: { select: { usageEvents: true } },
      },
    });
    if (!student) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }

    // Fetch recent usage events
    const recentEvents = await prisma.usageEvent.findMany({
      where: { studentId: req.params.id },
      include: { tool: { select: { name: true, type: true } } },
      orderBy: { startTime: 'desc' },
      take: 10,
    });

    // Fetch usage stats
    const [totalDuration, topTools] = await Promise.all([
      prisma.usageEvent.aggregate({
        where: { studentId: req.params.id },
        _sum: { durationSeconds: true },
      }),
      prisma.usageEvent.groupBy({
        by: ['toolName'],
        where: { studentId: req.params.id },
        _count: { toolName: true },
        orderBy: { _count: { toolName: 'desc' } },
        take: 5,
      }),
    ]);

    res.json({
      ...student,
      passwordHash: undefined,
      recentEvents,
      stats: {
        totalEvents: student._count.usageEvents,
        totalDurationSeconds: totalDuration._sum.durationSeconds || 0,
        topTools: topTools.map(t => ({ toolName: t.toolName, count: t._count.toolName })),
      },
    });
  } catch (err) {
    logger.error('Student detail error:', err);
    res.status(500).json({ error: 'Failed to fetch student details' });
  }
});



// ── Usage Logs ───────────────────────────────────────────────────────────────

// GET /api/admin/usage
adminRouter.get('/usage', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const { studentId, toolId, source, from, to, sapId, search, appType, browser } = req.query;

  const where: any = {};
  if (studentId) where.studentId = studentId;
  if (sapId) {
    const student = await prisma.student.findUnique({ where: { sapId: sapId as string } });
    if (student) where.studentId = student.id;
  }
  if (toolId) where.toolId = toolId;
  if (source) where.source = source;
  if (appType === 'WEB' || appType === 'APP' || appType === 'EMBEDDED') {
    where.tool = { type: appType };
  }
  if (browser && browser !== 'ALL') {
    where.browserName = { contains: browser as string, mode: 'insensitive' };
  }
  if (search) {
    where.OR = [
      { toolName: { contains: search as string, mode: 'insensitive' } },
      { browserName: { contains: search as string, mode: 'insensitive' } },
      { student: { name: { contains: search as string, mode: 'insensitive' } } },
      { student: { sapId: { contains: search as string, mode: 'insensitive' } } },
      { device: { hostname: { contains: search as string, mode: 'insensitive' } } },
    ];
  }
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
          student: { select: { sapId: true, name: true, branch: true } },
          device: { select: { hostname: true, osType: true } },
          tool: { select: { name: true, type: true, pattern: true } },
        },
        orderBy: { startTime: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.usageEvent.count({ where }),
    ]);

    const activeList = getActiveSessions();
    let combinedEvents: any[] = [...events];

    // If fetching first page without historical date filter, prepend currently active sessions
    if (page === 1 && !from && !to) {
      const activeEventObjects = activeList
        .filter(s => {
          if (studentId && s.studentId !== studentId) return false;
          if (sapId && s.sapId !== sapId) return false;
          if (toolId && s.toolId !== toolId) return false;
          if (search) {
            const term = (search as string).toLowerCase();
            return (
              s.toolName.toLowerCase().includes(term) ||
              s.studentName.toLowerCase().includes(term) ||
              s.sapId.toLowerCase().includes(term) ||
              (s.browserName && s.browserName.toLowerCase().includes(term))
            );
          }
          return true;
        })
        .map(s => ({
          id: s.eventId,
          studentId: s.studentId,
          deviceId: '',
          toolId: s.toolId || null,
          toolName: s.toolName,
          source: s.source,
          startTime: new Date(s.startTime),
          endTime: null,
          durationSeconds: null,
          rawIdentifier: s.rawIdentifier || null,
          browserName: s.browserName,
          isUnknownTool: s.isUnknownTool,
          createdAt: new Date(s.startTime),
          student: { sapId: s.sapId, name: s.studentName, branch: s.branch },
          device: { hostname: s.deviceHostname || 'Desktop', osType: 'UNKNOWN' },
          tool: { name: s.toolName, type: 'WEB', pattern: '' },
          eventType: 'ACTIVE' as const,
          sessionKey: s.sessionKey,
        }));

      // Combine, placing live active sessions at top
      combinedEvents = [...activeEventObjects, ...events];
    }

    res.json({
      events: combinedEvents,
      activeSessions: activeList,
      pagination: { page, limit, total: total + activeList.length, totalPages: Math.ceil((total + activeList.length) / limit) }
    });
  } catch (err: any) {
    logger.error('Failed to fetch usage logs:', err);
    res.status(500).json({ error: 'Failed to fetch usage logs' });
  }
});

// GET /api/admin/active-sessions — get currently active student tool sessions
adminRouter.get('/active-sessions', async (_req: Request, res: Response) => {
  try {
    const active = getActiveSessions();
    res.json({ activeSessions: active, count: active.length });
  } catch (err: any) {
    logger.error('Failed to fetch active sessions:', err);
    res.status(500).json({ error: 'Failed to fetch active sessions' });
  }
});

// GET /api/admin/usage/export — CSV export
adminRouter.get('/usage/export', async (req: Request, res: Response) => {
  const { from, to, studentId, toolId, search, appType } = req.query;
  const where: any = {};
  if (studentId) where.studentId = studentId;
  if (toolId) where.toolId = toolId;
  if (appType === 'WEB' || appType === 'APP' || appType === 'EMBEDDED') {
    where.tool = { type: appType };
  }
  if (search) {
    where.OR = [
      { toolName: { contains: search as string, mode: 'insensitive' } },
      { student: { name: { contains: search as string, mode: 'insensitive' } } },
      { student: { sapId: { contains: search as string, mode: 'insensitive' } } },
      { device: { hostname: { contains: search as string, mode: 'insensitive' } } },
    ];
  }
  if (from || to) {
    where.startTime = {};
    if (from) where.startTime.gte = new Date(from as string);
    if (to) where.startTime.lte = new Date(to as string);
  }

  try {
    const events = await prisma.usageEvent.findMany({
      where,
      include: {
        student: { select: { sapId: true, name: true, branch: true } },
        tool: { select: { name: true, type: true } },
        device: { select: { hostname: true, osType: true } },
      },
      orderBy: { startTime: 'desc' },
    });

    const formatDur = (secs?: number | null) => {
      if (!secs) return '< 1s';
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return m > 0 ? `${m}m ${s}s` : `${s}s`;
    };

    const headers = [
      'Student Name',
      'SAP ID',
      'Branch',
      'AI Tool Name',
      'Application Type',
      'Browser Name',
      'Start Time',
      'End Time',
      'Duration (sec)',
      'Duration (formatted)',
      'Device Name',
      'OS',
      'Detection Status',
      'Raw Window / Process',
    ];

    const rows = events.map(e => {
      const appTypeStr = e.tool?.type === 'EMBEDDED'
        ? 'In-app AI'
        : e.tool?.type === 'APP' || e.browserName === 'Desktop Application' ? 'Desktop App' : 'Web App';
      const browserStr = appTypeStr === 'Desktop App' ? 'N/A (Desktop)' : (e.browserName || 'Web Browser');
      const statusStr = e.endTime ? 'Completed' : 'Active / Detected';

      return [
        e.student.name,
        e.student.sapId,
        e.student.branch,
        e.toolName,
        appTypeStr,
        browserStr,
        e.startTime.toISOString(),
        e.endTime?.toISOString() || '',
        e.durationSeconds?.toString() || '0',
        formatDur(e.durationSeconds),
        e.device.hostname,
        e.device.osType,
        statusStr,
        e.rawIdentifier || '',
      ];
    });

    const csv = [headers, ...rows].map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="ai-usage-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err: any) {
    logger.error('Export failed:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

// ── Analytics ─────────────────────────────────────────────────────────────────

// GET /api/admin/analytics
adminRouter.get('/analytics', async (_req: Request, res: Response) => {
  try {
    const [
      totalStudents,
      totalEvents,
      totalDuration,
      topTools,
      topStudents,
      sourceBreakdown,
      dailyUsage,
      pendingToolsCount,
    ] = await Promise.all([
      prisma.student.count(),
      prisma.usageEvent.count(),
      prisma.usageEvent.aggregate({ _sum: { durationSeconds: true } }),
      prisma.usageEvent.groupBy({
        by: ['toolName'],
        _count: { toolName: true },
        _sum: { durationSeconds: true },
        orderBy: { _count: { toolName: 'desc' } },
        take: 10,
      }),
      prisma.usageEvent.groupBy({
        by: ['studentId'],
        _count: { studentId: true },
        orderBy: { _count: { studentId: 'desc' } },
        take: 10,
      }),
      prisma.usageEvent.groupBy({
        by: ['source'],
        _count: { source: true },
      }),
      // Last 30 days daily usage
      prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT DATE(start_time) as date, COUNT(*) as count
        FROM usage_events
        WHERE start_time >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(start_time)
        ORDER BY date ASC
      `,
      prisma.aIToolSignature.count({ where: { status: 'PENDING' } }),
    ]);

    // Fetch student names for top students
    const studentIds = topStudents.map(s => s.studentId);
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, name: true, sapId: true, branch: true },
    });
    const studentMap = Object.fromEntries(students.map(s => [s.id, s]));

    res.json({
      summary: {
        totalStudents,
        totalEvents,
        totalDurationHours: Math.round((totalDuration._sum.durationSeconds || 0) / 3600 * 10) / 10,
        pendingToolsCount,
      },
      topTools: topTools.map(t => ({
        toolName: t.toolName,
        eventCount: t._count.toolName,
        totalDurationSeconds: t._sum.durationSeconds || 0,
      })),
      topStudents: topStudents.map(s => ({
        student: studentMap[s.studentId] || { id: s.studentId },
        eventCount: s._count.studentId,
      })),
      sourceBreakdown: sourceBreakdown.map(s => ({
        source: s.source,
        count: s._count.source,
      })),
      dailyUsage: dailyUsage.map(d => ({
        date: d.date,
        count: Number(d.count),
      })),
    });
  } catch (err) {
    logger.error('Analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ── Settings ─────────────────────────────────────────────────────────────────

// GET /api/admin/settings
adminRouter.get('/settings', async (_req: Request, res: Response) => {
  try {
    const settings = await prisma.appSetting.findMany();
    const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
    res.json(map);
  } catch {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PATCH /api/admin/settings
adminRouter.patch('/settings', async (req: Request, res: Response) => {
  const allowed = [
    'monitoring_enabled',
    'auto_track_ai_tools',
    'auto_flag_unknown_tools',
    'auto_approve_flagged_tools',
    'instant_detection_enabled',
    'monitoring_hours_start',
    'monitoring_hours_end',
    'monitoring_all_hours',
    'session_dedup_minutes',
    'heartbeat_interval_seconds',
    'tool_sync_interval_minutes',
  ];

  try {
    const updates: { key: string; value: string }[] = [];
    for (const [key, value] of Object.entries(req.body)) {
      if (allowed.includes(key)) {
        updates.push({ key, value: String(value) });
      }
    }

    for (const update of updates) {
      await prisma.appSetting.upsert({
        where: { key: update.key },
        update: { value: update.value },
        create: { key: update.key, value: update.value },
      });
    }

    const allSettings = await prisma.appSetting.findMany();
    const settingsMap = Object.fromEntries(allSettings.map(s => [s.key, s.value]));
    emitSettingsUpdated(settingsMap);

    logger.info(`Settings updated by ${req.admin!.email}:`, req.body);
    res.json({ message: 'Settings updated', settings: settingsMap, updated: updates.map(u => u.key) });
  } catch {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ── Student Password Reset (admin-assisted) ───────────────────────────────────
// No SMTP/email infra is assumed, so reset is admin-initiated: admin generates
// a temporary password for a student who has lost access, and communicates it
// to them through the institution's existing channel (in person, official email, etc.).
// PATCH /api/admin/students/:id/reset-password
adminRouter.patch(
  '/students/:id/reset-password',
  async (req: Request, res: Response) => {
    try {
      const student = await prisma.student.findUnique({ where: { id: req.params.id } });
      if (!student) {
        res.status(404).json({ error: 'Student not found' });
        return;
      }

      // Generate a random temporary password (12 chars, alphanumeric)
      const tempPassword = crypto.randomBytes(9).toString('base64url').slice(0, 12);
      const passwordHash = await bcrypt.hash(tempPassword, 12);

      await prisma.student.update({
        where: { id: req.params.id },
        data: { passwordHash },
      });

      logger.info(`Password reset for student ${student.sapId} by admin ${req.admin!.email}`);

      // Returned once, only to the admin — never stored or logged in plaintext.
      res.json({
        message: 'Password reset successfully. Share this temporary password with the student securely; they should change it after signing in.',
        sapId: student.sapId,
        temporaryPassword: tempPassword,
      });
    } catch (err) {
      logger.error('Password reset error:', err);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  }
);

// ── Suspend / Reactivate Student ───────────────────────────────────────────────
// PATCH /api/admin/students/:id/status
adminRouter.patch(
  '/students/:id/status',
  [body('status').isIn(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']).withMessage('Invalid status')],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const student = await prisma.student.update({
        where: { id: req.params.id },
        data: { status: req.body.status },
      });
      logger.info(`Student ${student.sapId} status set to ${req.body.status} by admin ${req.admin!.email}`);
      res.json({ message: 'Student status updated', status: student.status });
    } catch {
      res.status(404).json({ error: 'Student not found' });
    }
  }
);


// ── Admin access requests (superadmin only; role is read from the database) ─────────
async function requireSuperadmin(req: Request, res: Response): Promise<boolean> {
  const me = await prisma.adminUser.findUnique({ where: { id: req.admin!.adminId } });
  if (me?.role === 'superadmin' && me.status === 'active') return true;
  res.status(403).json({ error: 'Superadmin access required' });
  return false;
}

adminRouter.get('/admin-requests', async (req: Request, res: Response) => {
  if (!(await requireSuperadmin(req, res))) return;
  const requests = await prisma.adminUser.findMany({
    where: { status: 'pending' },
    select: { id: true, name: true, email: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ requests });
});

adminRouter.patch('/admin-requests/:id/approve', async (req: Request, res: Response) => {
  if (!(await requireSuperadmin(req, res))) return;
  const result = await prisma.adminUser.updateMany({ where: { id: req.params.id, status: 'pending' }, data: { status: 'active' } });
  if (result.count === 0) { res.status(404).json({ error: 'Request not found' }); return; }
  logger.info(`Admin access approved for ${req.params.id} by ${req.admin!.email}`);
  res.json({ approved: true });
});

adminRouter.delete('/admin-requests/:id', async (req: Request, res: Response) => {
  if (!(await requireSuperadmin(req, res))) return;
  const result = await prisma.adminUser.deleteMany({ where: { id: req.params.id, status: 'pending' } });
  if (result.count === 0) { res.status(404).json({ error: 'Request not found' }); return; }
  logger.info(`Admin access request ${req.params.id} rejected by ${req.admin!.email}`);
  res.json({ rejected: true });
});
