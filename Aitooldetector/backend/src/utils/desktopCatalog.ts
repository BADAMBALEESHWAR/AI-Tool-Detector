import { AI_CATALOG_VERSION, BUILTIN_AI_TOOLS } from './aiToolsPreset';

/** Shape of desktop-app/src/data/ai-tools.json — the same fields GET /api/tools returns. */
export function buildDesktopCatalog() {
  return {
    catalogVersion: AI_CATALOG_VERSION,
    tools: BUILTIN_AI_TOOLS.map(t => ({
      id: t.pattern.replace(/^embedded:/, '').toLowerCase().replace(/\.exe$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      name: t.name,
      type: t.type,
      pattern: t.pattern,
      aliases: t.aliases,
      keywords: t.keywords,
      description: t.description,
      status: 'BUILT_IN',
    })),
  };
}
