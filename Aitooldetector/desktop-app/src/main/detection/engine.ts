import { CompiledCatalog, WebRule, exeKey, normalizeSignature } from './catalog';
import { NON_AI_SITES, browserName, cleanPageTitle, hostAppName, processKey, titleSegments } from './titles';

/** Everything one scan cycle observed. Contains titles and names only — never page content. */
export interface ScanSnapshot {
  windows: { process: string; title: string }[];   // visible top-level windows
  tabs: { process: string; title: string }[];      // browser tab-strip titles
  processes: string[];                              // running executables
  markers: { process: string; ruleId: string }[];  // built-in AI panels found by the deep scan
}

export interface Detection {
  key: string;                          // "<toolId>:<surface>" — one session per key
  toolId: string;
  toolName: string;
  kind: 'WEB' | 'APP' | 'EMBEDDED';
  surface: string;                      // "Google Chrome", "Desktop Application", "Visual Studio Code"…
  evidence: string;                     // shown to the student and admin; no content
}

/** A possible AI tool not in the catalog — sent to admins for review, never counted as usage. */
export interface Candidate {
  name: string;
  pattern: string;
  type: 'WEB' | 'APP';
  evidence: string;
}

const SELF = new Set(['ai monitor', 'ai-monitor', 'aimonitor', 'tabscanner', 'electron']);

/** Matches a browser tab/window title against the catalog's web rules. */
export function matchWebTitle(rules: WebRule[], rawTitle: string): WebRule | null {
  const title = cleanPageTitle(rawTitle);
  if (!title) return null;
  const full = normalizeSignature(title);
  const segments = titleSegments(title);

  // 1. A whole-title signature ("Copilot - GitHub") is unambiguous.
  for (const rule of rules) if (rule.titles.includes(full)) return rule;

  // 2. Titles from search engines, video and news sites only mention AI tools.
  if (segments.some(s => NON_AI_SITES.has(s))) return null;

  // 3. The site name is the first or last segment ("Fix CSS - Claude", "Poe - Fast AI Chat").
  const ends = Array.from(new Set([segments[0], segments[segments.length - 1]]));
  for (const rule of rules) if (rule.titles.some(t => ends.includes(t))) return rule;

  // 4. Some sites show their domain in the title.
  for (const rule of rules) {
    for (const d of rule.domains) {
      const re = new RegExp(`(^|[^a-z0-9.-])${escapeRegExp(d)}($|[^a-z0-9-])`);
      if (re.test(full)) return rule;
    }
  }
  return null;
}

export function detect(snapshot: ScanSnapshot, catalog: CompiledCatalog): Detection[] {
  const found = new Map<string, Detection>();
  const add = (d: Omit<Detection, 'key'>) => {
    const key = `${d.toolId}:${d.surface}`;
    if (!found.has(key)) found.set(key, { ...d, key });
  };

  // Browser tabs (Windows scanner) and browser window titles (active tab on any OS).
  const pages = [
    ...snapshot.tabs.map(t => ({ ...t, from: 'Tab' })),
    ...snapshot.windows.filter(w => browserName(w.process)).map(w => ({ ...w, from: 'Window' })),
  ];
  for (const page of pages) {
    const browser = browserName(page.process);
    if (!browser) continue;
    const rule = matchWebTitle(catalog.web, page.title);
    if (rule) {
      add({ toolId: rule.toolId, toolName: rule.toolName, kind: 'WEB', surface: browser, evidence: `${page.from} "${cleanPageTitle(page.title)}"` });
    }
  }

  // AI desktop applications by executable name.
  for (const proc of snapshot.processes) {
    const key = exeKey(proc);
    if (SELF.has(key)) continue;
    const app = catalog.apps.get(key);
    if (app) add({ toolId: app.toolId, toolName: app.toolName, kind: 'APP', surface: 'Desktop Application', evidence: `Process ${proc}` });
  }

  // Built-in AI panels reported by the deep scan.
  const byRule = new Map(catalog.markers.map(m => [m.ruleId, m]));
  for (const hit of snapshot.markers) {
    const rule = byRule.get(hit.ruleId);
    if (!rule || !rule.hosts.includes(processKey(hit.process))) continue;
    const host = hostAppName(hit.process);
    add({ toolId: rule.toolId, toolName: rule.toolName, kind: 'EMBEDDED', surface: host, evidence: `${rule.text} open in ${host}` });
  }

  // Built-in AI identified by a window title ("Window=Notion AI").
  for (const rule of catalog.markers) {
    if (rule.controlType.toLowerCase() !== 'window') continue;
    for (const w of snapshot.windows) {
      if (!rule.hosts.includes(processKey(w.process))) continue;
      const title = w.title.trim().toLowerCase();
      const text = rule.text.toLowerCase();
      if (rule.prefix ? title.startsWith(text) : title === text) {
        const host = hostAppName(w.process);
        add({ toolId: rule.toolId, toolName: rule.toolName, kind: 'EMBEDDED', surface: host, evidence: `${rule.text} open in ${host}` });
      }
    }
  }

  return Array.from(found.values());
}

/**
 * Deliberately strict: only a ".ai" domain visible in a browser title, or an
 * executable with a word starting or ending in "gpt"/"llm" ("mygpt-runner",
 * not "installmonitor"), is suggested to admins.
 */
export function findCandidates(snapshot: ScanSnapshot, catalog: CompiledCatalog): Candidate[] {
  const out = new Map<string, Candidate>();
  const known = new Set(catalog.web.flatMap(r => r.domains));

  for (const page of [...snapshot.tabs, ...snapshot.windows]) {
    if (!browserName(page.process)) continue;
    const title = cleanPageTitle(page.title);
    if (titleSegments(title).some(s => NON_AI_SITES.has(s)) || matchWebTitle(catalog.web, page.title)) continue;
    const m = /(?:^|[^a-z0-9.-])((?:[a-z0-9-]+\.)*[a-z0-9-]{2,}\.ai)(?:$|[^a-z0-9-])/i.exec(title);
    if (!m) continue;
    const domain = m[1].toLowerCase().replace(/^www\./, '');
    if (known.has(domain) || out.has(domain)) continue;
    const base = domain.replace(/\.ai$/, '').split('.').pop() || domain;
    out.set(domain, { name: `${base.charAt(0).toUpperCase()}${base.slice(1)} AI`, pattern: domain, type: 'WEB', evidence: `Title "${title}"` });
  }

  for (const proc of snapshot.processes) {
    const key = exeKey(proc);
    const words = key.split(/[^a-z0-9]+/);
    const looksLikeLlm = words.some(w => /^(gpt|llm)|(gpt|llm)$/.test(w));
    if (SELF.has(key) || catalog.apps.has(key) || !looksLikeLlm) continue;
    const pattern = `${key}.exe`;
    if (!out.has(pattern)) out.set(pattern, { name: proc.replace(/\.exe$/i, ''), pattern, type: 'APP', evidence: `Process ${proc}` });
  }
  return Array.from(out.values());
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
