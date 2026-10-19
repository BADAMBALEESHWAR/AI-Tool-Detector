import { readFileSync } from 'fs';
import { join } from 'path';
import { AI_CATALOG_VERSION, BUILTIN_AI_TOOLS, parseMarker } from './aiToolsPreset';
import { buildDesktopCatalog } from './desktopCatalog';
import { legacyKeywords } from '../routes/tools';

describe('built-in AI catalog', () => {
  it('has unique patterns and names', () => {
    const patterns = BUILTIN_AI_TOOLS.map(t => t.pattern.toLowerCase());
    const names = BUILTIN_AI_TOOLS.map(t => t.name.toLowerCase());
    expect(new Set(patterns).size).toBe(patterns.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every web tool a domain and a title signature', () => {
    for (const t of BUILTIN_AI_TOOLS.filter(t => t.type === 'WEB')) {
      expect(t.pattern).toMatch(/\./);
      expect(t.keywords.length).toBeGreaterThan(0);
    }
  });

  it('never lists general-purpose sites as AI tools', () => {
    const domains = BUILTIN_AI_TOOLS.filter(t => t.type === 'WEB').flatMap(t => [t.pattern, ...t.aliases]);
    for (const general of ['notion.so', 'openai.com', 'anthropic.com', 'replit.com', 'huggingface.co', 'google.com', 'github.com', 'bing.com']) {
      expect(domains).not.toContain(general);
    }
  });

  it('gives every built-in AI feature host apps and valid markers', () => {
    for (const t of BUILTIN_AI_TOOLS.filter(t => t.type === 'EMBEDDED')) {
      expect(t.pattern).toMatch(/^embedded:[a-z0-9-]+$/);
      expect(t.aliases.length).toBeGreaterThan(0);
      expect(t.keywords.length).toBeGreaterThan(0);
      for (const marker of t.keywords) expect(parseMarker(marker)).not.toBeNull();
    }
  });

  it('parses marker syntax', () => {
    expect(parseMarker('Pane=Copilot')).toEqual({ controlType: 'Pane', op: '=', text: 'Copilot' });
    expect(parseMarker('Edit^Chat Input')).toEqual({ controlType: 'Edit', op: '^', text: 'Chat Input' });
    expect(parseMarker('Copilot')).toBeNull();
  });

  it('matches the copy bundled into the desktop app (run `npm run catalog:export`)', () => {
    const bundledPath = join(__dirname, '..', '..', '..', 'desktop-app', 'src', 'data', 'ai-tools.json');
    const bundled = JSON.parse(readFileSync(bundledPath, 'utf-8'));
    expect(bundled.catalogVersion).toBe(AI_CATALOG_VERSION);
    expect(bundled).toEqual(buildDesktopCatalog());
  });
});

describe('legacyKeywords (clients older than catalog v3)', () => {
  it('drops single dictionary words that v1 would match anywhere in a title', () => {
    expect(legacyKeywords(['Consensus', 'Elicit', 'Jasper', 'Lovable'])).toEqual([]);
  });

  it('keeps phrases, domains, unique brands and words v1 already matches strictly', () => {
    expect(legacyKeywords(['Le Chat', 'BLACKBOX.AI', 'ChatGPT', 'Claude', 'Copilot'])).toEqual(['Le Chat', 'BLACKBOX.AI', 'ChatGPT', 'Claude', 'Copilot']);
  });
});
