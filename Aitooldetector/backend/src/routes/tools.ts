import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { prisma } from '../utils/prisma';
import { requireStudent, requireAdmin } from '../middleware/auth';
import { emitPendingTool, emitToolsUpdated } from '../services/socket';
import { logger } from '../utils/logger';
import { applyBuiltinCatalog } from '../utils/catalogSync';
import { isOwnProduct, recordCandidate } from '../services/candidates';
import { isBlacklistedSystemProcess } from '../utils/systemBlacklist';

export const toolsRouter = Router();

// Single words desktop v1 can be sent: brand names unique enough for its match-anywhere rule,
// plus the words v1 already treats as ambiguous (it requires an exact title segment for those).
const DISTINCTIVE_KEYWORDS = new Set([
  'chatgpt', 'deepseek', 'notebooklm', 'huggingchat', 'chatpdf', 'quillbot', 'midjourney', 'elevenlabs',
  'writesonic', 'chatsonic', 'genspark', 'ideogram', 'lmarena', 'phind', 'gauth', 'perplexity', 'grok',
  'claude', 'gemini', 'copilot', 'kimi', 'poe', 'bolt', 'gamma', 'suno', 'runway', 'qwen', 'v0',
]);

/** Keyword list safe for clients that predate catalog v3 (desktop v1, browser extension). */
export function legacyKeywords(keywords: string[]): string[] {
  return keywords.filter(k => /\s|\./.test(k.trim()) || DISTINCTIVE_KEYWORDS.has(k.trim().toLowerCase()));
}

// ── GET /api/tools — public/student sync: returns approved + built-in tools & active settings ──
// EMBEDDED tools are only sent to clients that understand them (?catalog=3, desktop app v2+);
// older desktop clients and the browser extension would misread them as websites.
toolsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const supportsEmbedded = Number(req.query.catalog) >= 3;
    const [rawTools, appSettings] = await Promise.all([
      prisma.aIToolSignature.findMany({
        where: {
          status: { in: ['BUILT_IN', 'APPROVED'] },
          ...(supportsEmbedded ? {} : { type: { not: 'EMBEDDED' } }),
        },
        select: {
          id: true,
          name: true,
          type: true,
          pattern: true,
          aliases: true,
          keywords: true,
          description: true,
          status: true,
        },
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
      }),
      prisma.appSetting.findMany(),
    ]);

    const settingsMap = Object.fromEntries(appSettings.map(s => [s.key, s.value]));

    // Guard: ensure no blacklisted system processes ever get synced to clients
    const tools = rawTools
      .filter(
        t => !isBlacklistedSystemProcess(t.pattern) &&
             !isBlacklistedSystemProcess(t.name) &&
             !(t.pattern === 'google.com' && t.name !== 'Google Gemini')
      )
      .map(t => (supportsEmbedded || t.type !== 'WEB' ? t : { ...t, keywords: legacyKeywords(t.keywords) }));

    res.json({
      tools,
      settings: {
        monitoring_enabled: settingsMap.monitoring_enabled !== 'false',
        auto_track_ai_tools: settingsMap.auto_track_ai_tools !== 'false',
        auto_flag_unknown_tools: settingsMap.auto_flag_unknown_tools !== 'false',
        instant_detection_enabled: settingsMap.instant_detection_enabled !== 'false',
        session_dedup_minutes: parseInt(settingsMap.session_dedup_minutes || '5', 10),
      },
      syncedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error('Failed to fetch tools for sync:', err);
    res.status(500).json({ error: 'Failed to fetch tools' });
  }
});

// ── GET /api/tools/stats — admin statistics ──────────────────────────────────
toolsRouter.get('/stats', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [total, builtIn, approved, pending, rejected, webCount, appCount, embeddedCount] = await Promise.all([
      prisma.aIToolSignature.count(),
      prisma.aIToolSignature.count({ where: { status: 'BUILT_IN' } }),
      prisma.aIToolSignature.count({ where: { status: 'APPROVED' } }),
      prisma.aIToolSignature.count({ where: { status: 'PENDING' } }),
      prisma.aIToolSignature.count({ where: { status: 'REJECTED' } }),
      prisma.aIToolSignature.count({ where: { type: 'WEB' } }),
      prisma.aIToolSignature.count({ where: { type: 'APP' } }),
      prisma.aIToolSignature.count({ where: { type: 'EMBEDDED' } }),
    ]);
    res.json({ total, builtIn, approved, pending, rejected, webCount, appCount, embeddedCount });
  } catch {
    res.status(500).json({ error: 'Failed to fetch tool stats' });
  }
});

// ── GET /api/tools/all — admin full list with search & filter ────────────────
toolsRouter.get('/all', requireAdmin, async (req: Request, res: Response) => {
  const search = req.query.search as string | undefined;
  const status = req.query.status as string | undefined;
  const type = req.query.type as string | undefined;

  const where: any = {};
  if (status && status !== 'ALL') {
    where.status = status;
  }
  if (type && type !== 'ALL') {
    where.type = type;
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { pattern: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  try {
    const tools = await prisma.aIToolSignature.findMany({
      where,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
    res.json(tools);
  } catch {
    res.status(500).json({ error: 'Failed to fetch tools' });
  }
});

// ── GET /api/tools/pending — admin: pending tools for review ─────────────────
toolsRouter.get('/pending', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const tools = await prisma.aIToolSignature.findMany({
      where: { status: 'PENDING' },
      orderBy: [{ reportCount: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(tools);
  } catch {
    res.status(500).json({ error: 'Failed to fetch pending tools' });
  }
});

// ── POST /api/tools — admin creates a new AI tool ────────────────────────────
toolsRouter.post(
  '/',
  requireAdmin,
  [
    body('name').trim().notEmpty().withMessage('Tool name is required'),
    body('type').isIn(['WEB', 'APP', 'EMBEDDED']).withMessage('Type must be WEB, APP or EMBEDDED'),
    body('pattern').trim().notEmpty().withMessage('Primary pattern / domain / process is required'),
    body('aliases').optional().isArray(),
    body('keywords').optional().isArray(),
    body('description').optional().trim(),
    body('status').optional().isIn(['BUILT_IN', 'APPROVED', 'PENDING', 'REJECTED']),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { name, type, pattern, aliases = [], keywords = [], description, status = 'APPROVED' } = req.body;

    try {
      const existing = await prisma.aIToolSignature.findFirst({
        where: { pattern },
      });

      if (existing) {
        res.status(409).json({ error: `A tool with pattern "${pattern}" already exists (${existing.name})` });
        return;
      }

      const cleanKeywords = Array.isArray(keywords) && keywords.length > 0
        ? keywords.map(k => String(k).trim()).filter(Boolean)
        : [name];
      const cleanAliases = Array.isArray(aliases)
        ? aliases.map(a => String(a).trim()).filter(Boolean)
        : [];

      const tool = await prisma.aIToolSignature.create({
        data: {
          name,
          type,
          pattern,
          aliases: cleanAliases,
          keywords: cleanKeywords,
          description: description || undefined,
          status,
          addedBy: req.admin?.email || 'admin',
        },
      });

      emitToolsUpdated();
      logger.info(`AI tool created by admin ${req.admin?.email}: ${tool.name} (${tool.pattern})`);
      res.status(201).json({ message: 'AI tool created successfully', tool });
    } catch (err: any) {
      logger.error('Failed to create AI tool:', err);
      res.status(500).json({ error: 'Failed to create tool: ' + err.message });
    }
  }
);

// ── PUT /api/tools/:id — admin updates an existing AI tool ───────────────────
toolsRouter.put(
  '/:id',
  requireAdmin,
  [
    body('name').trim().notEmpty().withMessage('Tool name is required'),
    body('type').isIn(['WEB', 'APP', 'EMBEDDED']).withMessage('Type must be WEB, APP or EMBEDDED'),
    body('pattern').trim().notEmpty().withMessage('Primary pattern is required'),
    body('aliases').optional().isArray(),
    body('keywords').optional().isArray(),
    body('description').optional().trim(),
    body('status').optional().isIn(['BUILT_IN', 'APPROVED', 'PENDING', 'REJECTED']),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { name, type, pattern, aliases, keywords, description, status } = req.body;

    try {
      const existing = await prisma.aIToolSignature.findUnique({
        where: { id: req.params.id },
      });

      if (!existing) {
        res.status(404).json({ error: 'Tool not found' });
        return;
      }

      const cleanKeywords = Array.isArray(keywords) && keywords.length > 0
        ? keywords.map(k => String(k).trim()).filter(Boolean)
        : (existing.keywords && existing.keywords.length > 0 ? existing.keywords : [name]);
      const cleanAliases = Array.isArray(aliases)
        ? aliases.map(a => String(a).trim()).filter(Boolean)
        : existing.aliases;

      const updated = await prisma.aIToolSignature.update({
        where: { id: req.params.id },
        data: {
          name,
          type,
          pattern,
          aliases: cleanAliases,
          keywords: cleanKeywords,
          description: description !== undefined ? description : existing.description,
          status: status || existing.status,
        },
      });

      emitToolsUpdated();
      logger.info(`AI tool updated by admin ${req.admin?.email}: ${updated.name}`);
      res.json({ message: 'Tool updated successfully', tool: updated });
    } catch (err: any) {
      logger.error('Failed to update AI tool:', err);
      res.status(500).json({ error: 'Failed to update tool: ' + err.message });
    }
  }
);

// ── POST /api/tools/reset-defaults — admin restores built-in AI tools ─────────
toolsRouter.post('/reset-defaults', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { upserted, retired } = await applyBuiltinCatalog(prisma);
    emitToolsUpdated();
    logger.info(`Built-in AI tools restored by admin (${upserted} upserted, ${retired} retired)`);
    res.json({ message: `Successfully restored ${upserted} built-in AI tools`, count: upserted, retired });
  } catch (err: any) {
    logger.error('Failed to reset built-in tools:', err);
    res.status(500).json({ error: 'Failed to reset defaults: ' + err.message });
  }
});

// ── POST /api/tools/flag — desktop app flags an unknown tool ──────────────────
toolsRouter.post(
  '/flag',
  requireStudent,
  [
    body('pattern').trim().notEmpty().withMessage('Pattern (domain/process) required'),
    body('suggestedName').trim().notEmpty().withMessage('Suggested name required'),
    body('type').optional().isIn(['WEB', 'APP', 'UNKNOWN']),
    body('rawIdentifier').optional().trim(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { pattern, suggestedName, type = 'UNKNOWN', rawIdentifier } = req.body;

    try {
      const { outcome, tool } = await recordCandidate({ pattern, name: suggestedName, type, rawIdentifier });
      if (outcome === 'created') res.status(201).json({ tool });
      else if (outcome === 'known') res.json({ alreadyKnown: true, tool });
      else if (outcome === 'pending') res.json({ alreadyPending: true, tool });
      else if (outcome === 'disabled') res.json({ ignored: true, reason: 'auto_flag_disabled' });
      else res.json({ rejected: true, reason: 'not_enough_evidence' });
    } catch (err) {
      logger.error('Flag tool error:', err);
      res.status(500).json({ error: 'Failed to flag tool' });
    }
  }
);

// ── DELETE /api/tools/purge-false-positives ──────────────────────────────────
toolsRouter.delete('/purge-false-positives', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const allTools = await prisma.aIToolSignature.findMany({
      select: { id: true, name: true, pattern: true, status: true },
    });

    const toDelete = allTools.filter(
      t => isBlacklistedSystemProcess(t.pattern) || isBlacklistedSystemProcess(t.name) || isOwnProduct(t.name, t.pattern) ||
           (t.pattern === 'google.com' && t.name !== 'Google Gemini')
    );

    if (toDelete.length > 0) {
      await prisma.aIToolSignature.deleteMany({ where: { id: { in: toDelete.map(t => t.id) } } });
      emitToolsUpdated();
    }

    // Usage stored for tools that were never in the catalog (older clients' heuristics).
    const { count: deletedEvents } = await prisma.usageEvent.deleteMany({ where: { toolId: null, isUnknownTool: true } });

    logger.info(`Purged ${toDelete.length} false-positive tools and ${deletedEvents} uncatalogued usage events`);
    res.json({
      message: `Deleted ${toDelete.length} false-positive tools and ${deletedEvents} usage records of non-AI items`,
      deleted: toDelete.length,
      deletedEvents,
      tools: toDelete,
    });
  } catch (err) {
    logger.error('Purge false positives error:', err);
    res.status(500).json({ error: 'Failed to purge' });
  }
});

// ── PATCH /api/tools/:id/approve — admin approves a pending tool ──────────────
toolsRouter.patch('/:id/approve', requireAdmin, async (req: Request, res: Response) => {
  try {
    const tool = await prisma.aIToolSignature.findUnique({ where: { id: req.params.id } });
    if (!tool) {
      res.status(404).json({ error: 'Tool not found' });
      return;
    }

    const cleanKeywords = Array.isArray(req.body.keywords) && req.body.keywords.length > 0
      ? req.body.keywords.map((k: any) => String(k).trim()).filter(Boolean)
      : (tool.keywords?.length ? tool.keywords : [req.body.name || tool.name]);

    const cleanAliases = Array.isArray(req.body.aliases)
      ? req.body.aliases.map((a: any) => String(a).trim()).filter(Boolean)
      : tool.aliases;

    const updated = await prisma.aIToolSignature.update({
      where: { id: req.params.id },
      data: {
        status: 'APPROVED',
        addedBy: req.admin!.email,
        name: req.body.name?.trim() || tool.name,
        type: req.body.type || tool.type,
        pattern: req.body.pattern?.trim() || tool.pattern,
        aliases: cleanAliases,
        keywords: cleanKeywords,
        description: req.body.description !== undefined ? req.body.description : tool.description,
      },
    });

    emitToolsUpdated();
    logger.info(`Tool approved and added to active AI list: ${updated.name} (${updated.pattern}) by ${req.admin!.email}`);
    res.json({ message: `AI Tool "${updated.name}" approved successfully`, tool: updated });
  } catch (err: any) {
    logger.error('Failed to approve tool:', err);
    res.status(500).json({ error: 'Failed to approve tool: ' + err.message });
  }
});


// ── PATCH /api/tools/:id/reject — admin rejects a pending tool ───────────────
toolsRouter.patch('/:id/reject', requireAdmin, async (req: Request, res: Response) => {
  try {
    const tool = await prisma.aIToolSignature.findUnique({ where: { id: req.params.id } });
    if (!tool) {
      res.status(404).json({ error: 'Tool not found' });
      return;
    }

    const updated = await prisma.aIToolSignature.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED' },
    });

    emitToolsUpdated();
    logger.info(`Tool rejected: ${updated.name} by ${req.admin!.email}`);
    res.json({ message: 'Tool rejected', tool: updated });
  } catch {
    res.status(500).json({ error: 'Failed to reject tool' });
  }
});

// ── DELETE /api/tools/:id — admin deletes a tool ─────────────────────────────
toolsRouter.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const tool = await prisma.aIToolSignature.findUnique({ where: { id: req.params.id } });
    if (!tool) {
      res.status(404).json({ error: 'Tool not found' });
      return;
    }
    await prisma.aIToolSignature.delete({ where: { id: req.params.id } });
    emitToolsUpdated();
    logger.info(`Tool deleted: ${tool.name} by ${req.admin?.email}`);
    res.json({ message: `Tool "${tool.name}" deleted successfully` });
  } catch (err: any) {
    logger.error('Failed to delete tool:', err);
    res.status(500).json({ error: 'Failed to delete tool: ' + err.message });
  }
});
