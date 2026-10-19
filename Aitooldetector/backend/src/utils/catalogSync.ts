import type { PrismaClient } from '@prisma/client';
import { AI_CATALOG_VERSION, BUILTIN_AI_TOOLS } from './aiToolsPreset';
import { logger } from './logger';

const VERSION_KEY = 'builtin_catalog_version';

export interface CatalogSyncResult {
  upserted: number;
  retired: number;
}

/**
 * Writes the built-in catalog into the database: creates or updates every
 * preset (matched by pattern), keeping tools an admin REJECTED rejected, and
 * deletes built-in tools that are no longer in the catalog. Admin-added and
 * auto-detected tools are never touched. Usage history keeps the tool name
 * when a retired tool is deleted (toolId is set to null).
 */
export async function applyBuiltinCatalog(prisma: PrismaClient): Promise<CatalogSyncResult> {
  let upserted = 0;
  for (const tool of BUILTIN_AI_TOOLS) {
    const existing = await prisma.aIToolSignature.findFirst({ where: { pattern: tool.pattern } });
    const data = {
      name: tool.name,
      type: tool.type,
      aliases: tool.aliases,
      keywords: tool.keywords,
      description: tool.description,
      addedBy: 'system',
    };
    if (existing) {
      await prisma.aIToolSignature.update({
        where: { id: existing.id },
        data: { ...data, status: existing.status === 'REJECTED' ? 'REJECTED' : 'BUILT_IN' },
      });
    } else {
      await prisma.aIToolSignature.create({ data: { ...data, pattern: tool.pattern, status: 'BUILT_IN' } });
    }
    upserted++;
  }

  const patterns = BUILTIN_AI_TOOLS.map(t => t.pattern);
  const { count: retired } = await prisma.aIToolSignature.deleteMany({
    where: { status: 'BUILT_IN', addedBy: 'system', pattern: { notIn: patterns } },
  });

  return { upserted, retired };
}

/** Applies the catalog once per AI_CATALOG_VERSION bump (called on server start). */
export async function upgradeBuiltinCatalogIfNeeded(prisma: PrismaClient): Promise<CatalogSyncResult | null> {
  const current = await prisma.appSetting.findUnique({ where: { key: VERSION_KEY } });
  if (current && Number(current.value) >= AI_CATALOG_VERSION) return null;

  const result = await applyBuiltinCatalog(prisma);
  await prisma.appSetting.upsert({
    where: { key: VERSION_KEY },
    update: { value: String(AI_CATALOG_VERSION) },
    create: { key: VERSION_KEY, value: String(AI_CATALOG_VERSION) },
  });
  logger.info(`Built-in AI catalog upgraded to v${AI_CATALOG_VERSION}: ${result.upserted} tools upserted, ${result.retired} retired`);
  return result;
}
