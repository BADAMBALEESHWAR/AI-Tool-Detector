import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { prisma } from '../utils/prisma';
import { requireStudent } from '../middleware/auth';
import { emitUsageEvent } from '../services/socket';
import { logger } from '../utils/logger';
import { isBlacklistedSystemProcess } from '../utils/systemBlacklist';
import { upsertActiveSession, removeActiveSession } from '../services/activeSessions';

export const usageRouter = Router();

function extractBrowserName(browserName?: string, rawIdentifier?: string, toolType?: string): string {
  if (toolType === 'APP' || browserName === 'Desktop Application' || browserName === 'Desktop') {
    return 'Desktop Application';
  }
  const raw = (rawIdentifier || '').toLowerCase();
  const explicit = (browserName || '').toLowerCase();
  const isSidePanel = explicit.includes('(side panel)') || explicit.includes('side panel') || raw.includes('[side panel') || raw.includes('(side panel)');
  const combined = `${explicit} ${raw}`;

  if (combined.includes('firefox')) return isSidePanel ? 'Mozilla Firefox (Side Panel)' : 'Mozilla Firefox';
  if (combined.includes('chrome')) return isSidePanel ? 'Google Chrome (Side Panel)' : 'Google Chrome';
  if (combined.includes('edg/') || combined.includes('edge') || combined.includes('microsoft edge')) return isSidePanel ? 'Microsoft Edge (Side Panel)' : 'Microsoft Edge';
  if (combined.includes('brave')) return isSidePanel ? 'Brave Browser (Side Panel)' : 'Brave Browser';
  if (combined.includes('opera') || combined.includes('opr/')) return isSidePanel ? 'Opera (Side Panel)' : 'Opera';
  if (combined.includes('safari') && !combined.includes('chrome')) return isSidePanel ? 'Safari (Side Panel)' : 'Safari';
  if (combined.includes('arc')) return isSidePanel ? 'Arc Browser (Side Panel)' : 'Arc Browser';
  if (combined.includes('vivaldi')) return isSidePanel ? 'Vivaldi (Side Panel)' : 'Vivaldi';

  if (isSidePanel) return 'Browser Side Panel';

  if (browserName && browserName !== 'Browser' && browserName !== 'Desktop') {
    return browserName;
  }
  return 'Web Browser';
}

/**
 * Links an event to a catalog tool: by database id first, then by name. Clients
 * running the bundled offline catalog send slug ids (e.g. "chatgpt"), so an
 * unknown id falls back to the name instead of dropping the link.
 */
async function resolveTool(toolId?: string, toolName?: string): Promise<{ id: string | null; type?: string }> {
  if (toolId) {
    const byId = await prisma.aIToolSignature.findUnique({ where: { id: toolId } }).catch(() => null);
    if (byId) return { id: byId.id, type: byId.type };
  }
  if (toolName) {
    const byName = await prisma.aIToolSignature.findFirst({ where: { name: { equals: toolName, mode: 'insensitive' } } });
    if (byName) return { id: byName.id, type: byName.type };
  }
  return { id: null };
}

// All usage event submission requires student auth
// POST /api/usage/event — ingest a usage event from desktop app or browser extension
usageRouter.post(
  '/event',
  requireStudent,
  [
    body('deviceId').notEmpty().withMessage('deviceId required'),
    body('toolName').trim().notEmpty().withMessage('toolName required'),
    body('source').isIn(['DESKTOP_APP', 'BROWSER_EXTENSION']).withMessage('Invalid source'),
    body('startTime').isISO8601().withMessage('startTime must be ISO8601'),
    body('endTime').optional().isISO8601(),
    body('durationSeconds').optional().isInt({ min: 0 }),
    body('rawIdentifier').optional().trim(),
    body('browserName').optional().trim(),
    body('isUnknownTool').optional().isBoolean(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const {
      deviceId,
      toolName,
      toolId,
      source,
      startTime,
      endTime,
      durationSeconds,
      rawIdentifier,
      browserName,
      isUnknownTool = false,
    } = req.body;

    const studentId = req.student!.studentId;
    const sapId = req.student!.sapId;

    // Immediately reject and ignore system processes and non-AI background software
    if (isBlacklistedSystemProcess(toolName) || isBlacklistedSystemProcess(rawIdentifier)) {
      logger.info(`Rejected blacklisted system process event from ${sapId}: ${toolName} (${rawIdentifier})`);
      res.status(200).json({ message: 'Ignored non-AI system process', ignored: true });
      return;
    }

    try {
      // Check monitoring & auto-track global settings
      const appSettings = await prisma.appSetting.findMany({
        where: {
          key: {
            in: [
              'monitoring_enabled',
              'auto_track_ai_tools',
              'monitoring_all_hours',
              'monitoring_hours_start',
              'monitoring_hours_end',
            ],
          },
        },
      });
      const settingsMap = Object.fromEntries(appSettings.map(s => [s.key, s.value]));

      if (settingsMap.monitoring_enabled === 'false') {
        res.status(200).json({ message: 'Monitoring disabled by administrator', ignored: true });
        return;
      }

      if (settingsMap.auto_track_ai_tools === 'false') {
        res.status(200).json({ message: 'Auto-track AI tools paused by administrator', ignored: true });
        return;
      }

      // Check monitoring operating hours if not 24/7
      if (settingsMap.monitoring_all_hours === 'false' && settingsMap.monitoring_hours_start && settingsMap.monitoring_hours_end) {
        const now = new Date();
        const currentHours = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
        const start = settingsMap.monitoring_hours_start;
        const end = settingsMap.monitoring_hours_end;
        if (start <= end) {
          if (currentHours < start || currentHours > end) {
            res.status(200).json({ message: 'Outside monitoring operating hours', ignored: true });
            return;
          }
        } else {
          if (currentHours < start && currentHours > end) {
            res.status(200).json({ message: 'Outside monitoring operating hours', ignored: true });
            return;
          }
        }
      }

      // Validate device belongs to student
      const device = await prisma.device.findFirst({
        where: { id: deviceId, studentId },
      });
      if (!device) {
        res.status(404).json({ error: 'Device not found or not owned by student' });
        return;
      }

      // Get student info for notification
      const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { name: true, branch: true },
      });

      // If toolId provided, validate it exists
      const { id: resolvedToolId, type: toolType } = await resolveTool(toolId, toolName);

      const resolvedBrowser = extractBrowserName(browserName, rawIdentifier, toolType);

      const event = await prisma.usageEvent.create({
        data: {
          studentId,
          deviceId,
          toolId: resolvedToolId,
          toolName,
          source,
          startTime: new Date(startTime),
          endTime: endTime ? new Date(endTime) : null,
          durationSeconds: durationSeconds || null,
          rawIdentifier: rawIdentifier || null,
          browserName: resolvedBrowser,
          isUnknownTool,
        },
      });

      const sessionKey = `${sapId}:${toolName}:${resolvedBrowser}`;

      // Remove from active sessions registry since session concluded
      removeActiveSession(sessionKey);

      // Emit real-time notification to admin
      emitUsageEvent({
        eventId: event.id,
        studentId,
        studentName: student?.name || 'Unknown',
        sapId,
        branch: student?.branch || 'Unknown',
        toolName,
        toolId: resolvedToolId ?? undefined,
        source,
        deviceHostname: device.hostname,
        browserName: resolvedBrowser,
        startTime: event.startTime.toISOString(),
        endTime: event.endTime?.toISOString(),
        durationSeconds: durationSeconds || undefined,
        rawIdentifier: rawIdentifier || undefined,
        isUnknownTool,
        eventType: 'DEACTIVATED',
        sessionKey,
      });

      logger.info(`Usage event (DEACTIVATED): ${sapId} → ${toolName} via ${resolvedBrowser} (${durationSeconds || 0}s)`);
      res.status(201).json({ eventId: event.id, message: 'Event recorded', sessionKey });
    } catch (err) {
      logger.error('Usage event error:', err);
      res.status(500).json({ error: 'Failed to record usage event' });
    }
  }
);

// GET /api/usage/student — own usage
usageRouter.get('/student', requireStudent, async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const studentId = req.student!.studentId;

  try {
    const [events, total] = await Promise.all([
      prisma.usageEvent.findMany({
        where: { studentId },
        include: { tool: { select: { name: true, type: true } } },
        orderBy: { startTime: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.usageEvent.count({ where: { studentId } }),
    ]);

    res.json({ events, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch {
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

// POST /api/usage/ping — real-time "session opened" notification
usageRouter.post('/ping', requireStudent, async (req: Request, res: Response) => {
  const {
    deviceId,
    toolName,
    toolId,
    source = 'DESKTOP_APP',
    startTime,
    rawIdentifier,
    browserName,
    isUnknownTool = false,
  } = req.body;

  if (!deviceId || !toolName || !startTime) {
    res.status(400).json({ error: 'deviceId, toolName, startTime required' });
    return;
  }

  const studentId = req.student!.studentId;
  const sapId = req.student!.sapId;

  // Immediately reject and ignore system processes and non-AI background software
  if (isBlacklistedSystemProcess(toolName) || isBlacklistedSystemProcess(rawIdentifier)) {
    logger.info(`Rejected blacklisted system process ping from ${sapId}: ${toolName} (${rawIdentifier})`);
    res.status(200).json({ message: 'Ignored non-AI system process', ignored: true });
    return;
  }

    try {
      // Check monitoring & auto-track global settings
      const appSettings = await prisma.appSetting.findMany({
        where: {
          key: {
            in: [
              'monitoring_enabled',
              'auto_track_ai_tools',
              'instant_detection_enabled',
              'monitoring_all_hours',
              'monitoring_hours_start',
              'monitoring_hours_end',
            ],
          },
        },
      });
      const settingsMap = Object.fromEntries(appSettings.map(s => [s.key, s.value]));

      if (settingsMap.monitoring_enabled === 'false' || settingsMap.auto_track_ai_tools === 'false') {
        res.status(200).json({ message: 'Monitoring or auto-track paused', ignored: true });
        return;
      }

      if (settingsMap.instant_detection_enabled === 'false') {
        res.status(200).json({ message: 'Instant detection disabled', ignored: true });
        return;
      }

      // Check monitoring operating hours if not 24/7
      if (settingsMap.monitoring_all_hours === 'false' && settingsMap.monitoring_hours_start && settingsMap.monitoring_hours_end) {
        const now = new Date();
        const currentHours = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
        const start = settingsMap.monitoring_hours_start;
        const end = settingsMap.monitoring_hours_end;
        if (start <= end) {
          if (currentHours < start || currentHours > end) {
            res.status(200).json({ message: 'Outside monitoring operating hours', ignored: true });
            return;
          }
        } else {
          if (currentHours < start && currentHours > end) {
            res.status(200).json({ message: 'Outside monitoring operating hours', ignored: true });
            return;
          }
        }
      }

      const [device, student] = await Promise.all([
        prisma.device.findFirst({ where: { id: deviceId, studentId } }),
        prisma.student.findUnique({
          where: { id: studentId },
          select: { name: true, branch: true },
        }),
      ]);

      if (!device) {
        res.status(404).json({ error: 'Device not found' });
        return;
      }

      const { id: resolvedToolId, type: toolType } = await resolveTool(toolId, toolName);

      const resolvedBrowser = extractBrowserName(browserName, rawIdentifier, toolType);
      const sessionKey = `${sapId}:${toolName}:${resolvedBrowser}`;

      // Register or update in active sessions registry
      upsertActiveSession({
        eventId: `ping-${studentId}-${resolvedToolId || toolName}-${Date.now()}`,
        studentId,
        studentName: student?.name || 'Unknown',
        sapId,
        branch: student?.branch || 'Unknown',
        toolName,
        toolId: resolvedToolId ?? undefined,
        source,
        deviceHostname: device.hostname,
        browserName: resolvedBrowser,
        startTime: new Date(startTime).toISOString(),
        lastPingAt: Date.now(),
        rawIdentifier: rawIdentifier || undefined,
        isUnknownTool,
        eventType: 'ACTIVE',
        sessionKey,
      });

      // Emit socket notification to admin
      emitUsageEvent({
        eventId: `ping-${studentId}-${resolvedToolId || toolName}-${Date.now()}`,
        studentId,
        studentName: student?.name || 'Unknown',
        sapId,
        branch: student?.branch || 'Unknown',
        toolName,
        toolId: resolvedToolId ?? undefined,
        source,
        deviceHostname: device.hostname,
        browserName: resolvedBrowser,
        startTime: new Date(startTime).toISOString(),
        rawIdentifier: rawIdentifier || undefined,
        isUnknownTool,
        eventType: 'ACTIVE',
        sessionKey,
      });

      res.json({ message: 'Live ping emitted', browserName: resolvedBrowser, sessionKey });
  } catch (err) {
    logger.error('Usage ping error:', err);
    res.status(500).json({ error: 'Failed to emit ping' });
  }
});
