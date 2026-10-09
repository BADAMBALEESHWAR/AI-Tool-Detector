import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

export interface ToolSignature {
  id: string;
  name: string;
  type: 'WEB' | 'APP';
  domains: string[];
  processNames: string[];
  windowTitleKeywords: string[];
  description?: string;
  status?: string;
}

interface ToolsDB {
  version: string;
  updatedAt: string;
  tools: ToolSignature[];
  heuristicPatterns: {
    domainKeywords: string[];
    titleKeywords: string[];
    processKeywords: string[];
  };
}

export interface DiscoveredTool {
  name: string;
  pattern: string;
  type: 'WEB' | 'APP';
}

// ── Known system processes / background daemons that should NEVER be matched as AI tools ──
export const SYSTEM_BLACKLIST_KEYWORDS = [
  // Nvidia & GPU services
  'nvdisplay',
  'nvcontainer',
  'nvtelemetry',
  'nvidia',
  'geforce',
  'nvcplui',
  'nvnodejslauncher',
  'nvspcaps64',
  'amdrsserv',
  'radeon',
  'igfx',

  // OEM software, hardware utilities & monitors
  'omeninstallmonitor',
  'omen',
  'hp ',
  'hp.',
  'hp_',
  'dell',
  'alienware',
  'lenovo',
  'acer',
  'asus',
  'armoury',
  'armourycrate',
  'samsung',
  'mysagethumbs',

  // Windows system processes & service hosts
  'svchost',
  'explorer',
  'taskmgr',
  'winlogon',
  'lsass',
  'dwm',
  'csrss',
  'searchindexer',
  'searchapp',
  'searchhost',
  'msiexec',
  'ctfmon',
  'audiodg',
  'spoolsv',
  'system',
  'conhost',
  'runtimebroker',
  'smartscreen',
  'securityhealthservice',
  'shellexperiencehost',
  'startmenuexperiencehost',
  'lockapp',
  'applicationframehost',
  'textinputhost',
  'systemsettings',
  'backgroundtaskhost',

  // Installers, updaters, setup programs
  'installmonitor',
  'installer',
  'setup.exe',
  'updater',
  'uninstall',

  // Antivirus / Security tools
  'antivirus',
  'defender',
  'avast',
  'norton',
  'malware',
  'kaspersky',
  'mcafee',

  // Generic shells & runtimes (unless explicitly registered AI tools like Cursor/Windsurf/Antigravity)
  'powershell',
  'cmd.exe',
  'git.exe',
  'bash.exe',

  // Browsers (handled via web domain matching, not as desktop AI tools)
  'chrome.exe',
  'firefox.exe',
  'msedge.exe',
  'brave.exe',
  'opera.exe',
  'safari.exe',
  'vivaldi.exe',
  'arc.exe',

  // The AI Monitor detector itself (NEVER detect self)
  'ai monitor',
  'ai monitor desktop',
  'ai monitor setup',
  'ai-monitor',
  'ai_monitor',
  'aimonitor',
  'ai-monitor-desktop',
  'ai monitor.exe',
  'ai tool detector',
  'electron',
  'electron.exe',
];

export function isBlacklistedSystemProcess(str?: string | null): boolean {
  if (!str) return false;
  const clean = str.toLowerCase().replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '').trim();
  if (!clean) return false;

  const cleanNoExe = clean.replace(/\.exe$/, '');

  for (const pattern of SYSTEM_BLACKLIST_KEYWORDS) {
    const p = pattern.toLowerCase();
    if (clean === p || cleanNoExe === p || clean.includes(p)) {
      return true;
    }
  }

  if (
    clean === 'ai' ||
    clean === 'a.i.' ||
    clean === 'ai.ai' ||
    clean.includes('omen') ||
    clean.includes('nvdisplay') ||
    clean.includes('nvcontainer') ||
    clean.includes('installmonitor') ||
    clean.includes('ai monitor') ||
    clean.includes('aimonitor') ||
    clean.includes('ai-monitor')
  ) {
    return true;
  }

  return false;
}

export function isInvalidOrBlacklistedTool(tool: ToolSignature): boolean {
  if (!tool || !tool.name) return true;
  const name = tool.name.toLowerCase().trim();
  const id = (tool.id || '').toLowerCase();

  if (name === 'ai' || name === 'a.i.' || id === 'ai' || (tool.domains && tool.domains.includes('ai.ai'))) return true;
  if (isBlacklistedSystemProcess(name) || isBlacklistedSystemProcess(id)) return true;

  // Check if any process name or keyword is blacklisted
  if (tool.processNames && tool.processNames.some(p => isBlacklistedSystemProcess(p))) return true;
  if (tool.windowTitleKeywords && tool.windowTitleKeywords.some(k => isBlacklistedSystemProcess(k))) return true;

  // Specific false positives from older syncs
  if (
    name.includes('nvdisplay') ||
    name.includes('omen') ||
    name.includes('installmonitor') ||
    name.includes('ai monitor') ||
    name.includes('aimonitor') ||
    (name === 'chat gtp' && tool.domains?.includes('google.com'))
  ) {
    return true;
  }

  return false;
}

// Path to bundled DB (in app resources) and user-overrides (in userData)
function getBundledPath(): string {
  const candidates = [
    app?.isPackaged && process.resourcesPath ? join(process.resourcesPath, 'data', 'ai-tools.json') : '',
    process.resourcesPath ? join(process.resourcesPath, 'data', 'ai-tools.json') : '',
    join(__dirname, '../../src/data/ai-tools.json'),
    join(__dirname, '../data/ai-tools.json'),
    join(__dirname, 'data/ai-tools.json'),
    join(process.cwd(), 'src/data/ai-tools.json'),
    join(process.cwd(), 'data/ai-tools.json'),
  ].filter(Boolean);

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0] || join(__dirname, '../../src/data/ai-tools.json');
}

function getUserPath(): string {
  if (!app || typeof app.getPath !== 'function') {
    return '';
  }
  try {
    return join(app.getPath('userData'), 'ai-tools-synced.json');
  } catch {
    return '';
  }
}

let cachedDB: ToolsDB | null = null;

export function loadToolsDB(): ToolsDB {
  if (cachedDB) return cachedDB;

  const userPath = getUserPath();
  const bundledPath = getBundledPath();

  try {
    if (userPath && existsSync(userPath)) {
      const synced = JSON.parse(readFileSync(userPath, 'utf-8')) as ToolsDB;
      if (synced && Array.isArray(synced.tools) && synced.tools.length > 0) {
        // Sanitize: strip out any invalid or blacklisted tools
        const sanitizedTools = synced.tools.filter(t => !isInvalidOrBlacklistedTool(t));
        cachedDB = { ...synced, tools: sanitizedTools };
        return cachedDB;
      }
    }
  } catch {
    // Fall back to bundled
  }

  try {
    const bundled = JSON.parse(readFileSync(bundledPath, 'utf-8')) as ToolsDB;
    const sanitizedTools = (bundled.tools || []).filter(t => !isInvalidOrBlacklistedTool(t));
    cachedDB = { ...bundled, tools: sanitizedTools };
    return cachedDB;
  } catch (err) {
    const empty: ToolsDB = {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      tools: [],
      heuristicPatterns: { domainKeywords: [], titleKeywords: [], processKeywords: [] },
    };
    cachedDB = empty;
    return empty;
  }
}

export function saveToolsDB(db: ToolsDB): void {
  try {
    const userPath = getUserPath();
    const sanitizedTools = (db.tools || []).filter(t => !isInvalidOrBlacklistedTool(t));
    const sanitizedDB: ToolsDB = { ...db, tools: sanitizedTools };
    writeFileSync(userPath, JSON.stringify(sanitizedDB, null, 2), 'utf-8');
    cachedDB = sanitizedDB;
  } catch (err) {
    console.error('[toolsDB] Failed to save synced DB:', err);
  }
}

export function clearCache(): void {
  cachedDB = null;
}

// ── Matching helpers ─────────────────────────────────────────────────────────

// ── Common dictionary words or single names that require strict segment or AI context matching ──
const AMBIGUOUS_KEYWORDS = new Set([
  'bolt',
  'claude',
  'bard',
  'gamma',
  'kimi',
  'suno',
  'runway',
  'cursor',
  'jan',
  'poe',
  'pi',
  'gemini',
  'aria',
  'leo',
  'llama',
  'you',
  'qwen',
  'copilot',
]);

const AI_CONTEXT_PATTERN = /\b(ai|chat|bot|assistant|generator|app|studio|llm|model|prompt|anthropic|openai|google\s*ai|inflection|moonshot|deeplearning|coder|workspace|agent|microsoft|github|codeium|vercel|sidebar|side\s*panel)\b/i;
const TLD_PATTERN = /\b[a-z0-9-]+\.(ai|new|app|dev|io|so)\b/i;

export function matchProcess(tools: ToolSignature[], processName: string): ToolSignature | null {
  if (!processName) return null;
  if (isBlacklistedSystemProcess(processName)) return null;

  const cleanProc = processName.toLowerCase().replace(/\.exe$/, '').trim();

  for (const tool of tools) {
    if (tool.type !== 'APP' || isInvalidOrBlacklistedTool(tool)) continue;

    // 1. Exact match against registered process executable names
    for (const pName of tool.processNames) {
      if (isBlacklistedSystemProcess(pName)) continue;
      const cleanP = pName.toLowerCase().replace(/\.exe$/, '').trim();
      if (cleanProc === cleanP) {
        return tool;
      }
    }

    // 2. Exact match against tool name normalized
    const cleanToolName = tool.name.toLowerCase().replace(/\.exe$/, '').trim();
    if (cleanProc === cleanToolName) {
      return tool;
    }
  }
  return null;
}

export function matchWindowTitle(tools: ToolSignature[], title: string, preferredType?: 'WEB' | 'APP'): ToolSignature | null {
  if (!title) return null;
  if (isBlacklistedSystemProcess(title)) return null;

  const lowerTitle = title.toLowerCase().replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '').trim();
  if (!lowerTitle) return null;

  // Split title into segments by common browser tab title delimiters (-, –, —, |, :, ·)
  const segments = lowerTitle.split(/[:\-–—|·]\s*/).map(s => s.trim()).filter(Boolean);
  const hasAiContext = AI_CONTEXT_PATTERN.test(lowerTitle) || TLD_PATTERN.test(lowerTitle);

  // 1. First priority: Check if any registered domain appears in the window title
  for (const tool of tools) {
    if (isInvalidOrBlacklistedTool(tool)) continue;
    if (preferredType && tool.type !== preferredType) continue;

    if (tool.type === 'WEB' && tool.domains) {
      for (const domain of tool.domains) {
        if (!domain || domain.trim().length < 3) continue;
        const d = domain.toLowerCase().replace(/^www\./, '').trim();
        if (lowerTitle.includes(d)) {
          return tool;
        }
      }
    }
  }

  // 2. Build list of (tool, keyword) candidate pairs sorted longest/most specific keyword first
  const candidatePairs: { tool: ToolSignature; kw: string; isFallback?: boolean }[] = [];

  for (const tool of tools) {
    if (isInvalidOrBlacklistedTool(tool)) continue;
    if (preferredType && tool.type !== preferredType) continue;

    for (const kw of tool.windowTitleKeywords) {
      const cleanKw = kw.toLowerCase().trim();
      if (!cleanKw || cleanKw.length < 2 || cleanKw === 'ai' || cleanKw === 'a.i.' || isBlacklistedSystemProcess(cleanKw)) continue;
      candidatePairs.push({ tool, kw: cleanKw });
    }
  }

  // If preferredType was specified, also append opposite type candidates as lower-priority fallback
  if (preferredType) {
    for (const tool of tools) {
      if (isInvalidOrBlacklistedTool(tool)) continue;
      if (tool.type === preferredType) continue;
      for (const kw of tool.windowTitleKeywords) {
        const cleanKw = kw.toLowerCase().trim();
        if (!cleanKw || cleanKw.length < 2 || cleanKw === 'ai' || cleanKw === 'a.i.' || isBlacklistedSystemProcess(cleanKw)) continue;
        candidatePairs.push({ tool, kw: cleanKw, isFallback: true });
      }
    }
  }

  // Sort longest/most specific keyword first
  candidatePairs.sort((a, b) => {
    if (!a.isFallback && b.isFallback) return -1;
    if (a.isFallback && !b.isFallback) return 1;
    return b.kw.length - a.kw.length;
  });

  for (const { tool, kw } of candidatePairs) {
    const isAmbiguous = AMBIGUOUS_KEYWORDS.has(kw) || kw.length <= 3;

    // Check if an exact segment matches this keyword (e.g. "Claude" or "New chat - ChatGPT")
    const isExactSegment = segments.some(s => s === kw);

    if (isAmbiguous) {
      // For ambiguous single words (e.g. "Bolt", "Claude", "Gamma", "Cursor", "Bard", "Suno", "Kimi"):
      // Only match if it is an exact standalone segment OR the title contains AI context
      if (isExactSegment) {
        // Even for exact segment, ignore known non-AI generic segments
        if (kw === 'cursor' && segments.some(s => s.includes('css') || s.includes('mouse') || s.includes('pointer'))) {
          continue;
        }
        return tool;
      }

      // If not an exact segment, require regex word boundary AND AI context
      const wordRegex = new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i');
      if (wordRegex.test(lowerTitle) && hasAiContext) {
        return tool;
      }
    } else {
      // For unambiguous AI brand keywords (e.g. "chatgpt", "perplexity", "deepseek", "notebooklm", "aistudio", "github copilot", "antigravity ide"):
      if (isExactSegment) {
        return tool;
      }
      const wordRegex = new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i');
      if (wordRegex.test(lowerTitle)) {
        return tool;
      }
    }
  }

  return null;
}

export function matchDomain(tools: ToolSignature[], hostname: string): ToolSignature | null {
  if (!hostname) return null;
  const lowerHost = hostname.toLowerCase().replace(/^www\./, '').trim();
  for (const tool of tools) {
    if (isInvalidOrBlacklistedTool(tool)) continue;
    for (const domain of tool.domains) {
      const lowerDomain = domain.toLowerCase().replace(/^www\./, '').trim();
      if (lowerHost === lowerDomain || lowerHost.endsWith('.' + lowerDomain)) {
        return tool;
      }
    }
  }
  return null;
}

// ── Common non-AI websites that should never be flagged as heuristic AI tools ──
const NON_AI_POPULAR_DOMAINS = [
  'google.com', 'youtube.com', 'wikipedia.org', 'github.com', 'stackoverflow.com',
  'yahoo.com', 'reddit.com', 'linkedin.com', 'twitter.com', 'x.com', 'facebook.com',
  'amazon.com', 'microsoft.com', 'apple.com', 'netflix.com', 'instagram.com',
  'spotify.com', 'gmail.com', 'office.com', 'docs.google.com', 'drive.google.com'
];

// Non-AI false positive words that might contain "ai" or "illustrator"
const NON_AI_FALSE_POSITIVES = [
  'adobe illustrator', 'illustrator', 'mail', 'email', 'tail', 'air', 'aid', 'paid',
  'said', 'gain', 'main', 'paint', 'braid', 'chair', 'daily', 'airport', 'airline',
  'container', 'retail', 'maintain', 'domain', 'nvidia', 'omen'
];

// ── Heuristic Auto-Discovery Pattern Matcher for Unregistered / Emerging AI Tools ──
const AI_HEURISTIC_PATTERNS = [
  // 1. Broad AI word matching (word boundary checks)
  /\bAI\b/i,
  /\b(artificial\s*intelligence|generative\s*ai|gen\s*ai|llms?|gpt|copilot|assistant|agent|neural|machine\s*learning|prompt\s*engineering|ai\s*prompt)\b/i,
  /\b(ai\s*chat|ai\s*assistant|ai\s*copilot|ai\s*writer|ai\s*agent|ai\s*bot|ai\s*search|ai\s*code|ai\s*studio|ai\s*model|ai\s*editor|ai\s*workspace|ai\s*generator|ai\s*platform|ai\s*tool)\b/i,
  /\b(text\s*to\s*image|text\s*to\s*video|ai\s*video|ai\s*music|ai\s*voice|voice\s*ai)\b/i,
  
  // 2. Emerging & Popular AI Platforms / Brands
  /\b(deepseek|perplexity|chatgpt|openai|claude|anthropic|gemini|copilot|grok|mistral|einsia|manus|kling|ideogram|suno|udio|runway|pika|luma|leonardo|civitai|elevenlabs|hailuo|minimax|qwen|kimi|cohere|poe|character\.ai|phind|blackbox|gamma|chatpdf|genspark|notion\s*ai|recraft|flux|midjourney|emergent|krea|lovable|bolt|huggingchat|chatbot\s*arena|lmarena|groq)\b/i,
  
  // 3. AI Coding Assistants & IDEs
  /\b(cursor|windsurf|replit|tabnine|supermaven|augment|aider|v0|bolt|lovable|emergent)\b/i,
  
  // 4. Local LLM runtimes
  /\b(ollama|openrouter|jan\s*ai|lm\s*studio|anythingllm|localai)\b/i,
  
  // 5. Domains / TLDs
  /\b([a-z0-9-]+\.(ai|new|sh|io|app))\b/i,
  /\b(chat\.[a-z0-9-]+\.(com|ai|io|dev|app|net|org))\b/i,
];

// Clean browser suffixes from window titles
const BROWSER_SUFFIX_REGEX = /\s*[-–—|]\s*(Google Chrome|Microsoft\s*Edge|Mozilla Firefox|Brave|Opera|Arc|Vivaldi|Safari|Chromium|Edge)\s*$/i;

export function matchHeuristicAITool(title?: string, processName?: string): DiscoveredTool | null {
  if (isBlacklistedSystemProcess(title) || isBlacklistedSystemProcess(processName)) {
    return null;
  }

  let cleanTitle = (title || '').replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '').trim();
  const cleanProc = (processName || '').replace(/\.exe$/i, '').trim();

  // Strip browser brand from end of window title if present
  cleanTitle = cleanTitle.replace(BROWSER_SUFFIX_REGEX, '').trim();

  // Check if title belongs to known non-AI popular websites
  const lowerTitle = cleanTitle.toLowerCase();
  for (const nonAi of NON_AI_POPULAR_DOMAINS) {
    if (lowerTitle === nonAi || lowerTitle.endsWith('.' + nonAi) || lowerTitle.includes('www.' + nonAi)) {
      return null;
    }
  }

  // Check if title is purely a known non-AI software (like Adobe Illustrator)
  if (NON_AI_FALSE_POSITIVES.some(fp => lowerTitle === fp || lowerTitle.startsWith(fp + ' '))) {
    return null;
  }

  // 1. Check title against AI heuristic patterns
  if (cleanTitle && cleanTitle.length >= 2) {
    for (const pattern of AI_HEURISTIC_PATTERNS) {
      const match = cleanTitle.match(pattern);
      if (match) {
        let suggestedName = match[0].trim();
        suggestedName = suggestedName.charAt(0).toUpperCase() + suggestedName.slice(1);

        let patternStr = (match[1] || match[0]).toLowerCase().trim();

        // Extract clean candidate tool name from title segments (supports fullwidth colon \uFF1A, :, -, |, etc.)
        const titleParts = cleanTitle.split(/\s*[\uFF1A:–—|·•/\\-]+\s*/).map(s => s.trim()).filter(Boolean);
        if (titleParts.length > 0 && titleParts[0].length >= 2 && titleParts[0].length <= 35) {
          const firstPart = titleParts[0];
          const lowerFirst = firstPart.toLowerCase();
          if (
            !lowerFirst.includes('chrome') &&
            !lowerFirst.includes('edge') &&
            !lowerFirst.includes('firefox') &&
            !lowerFirst.includes('browser') &&
            !lowerFirst.includes('new tab') &&
            !lowerFirst.includes('untitled') &&
            !isBlacklistedSystemProcess(firstPart)
          ) {
            suggestedName = firstPart;
            if (!suggestedName.toLowerCase().includes('ai') && !suggestedName.toLowerCase().includes('gpt') && !suggestedName.toLowerCase().includes('chat')) {
              // Append AI descriptor if concise
              if (suggestedName.length <= 15) {
                suggestedName = `${suggestedName} AI`;
              }
            }
          }
        }

        // Check if there is an embedded domain or URL in the title
        const domainMatch = cleanTitle.match(/\b([a-z0-9-]+\.(ai|io|dev|app|com|net|org))\b/i);
        if (domainMatch && domainMatch[1]) {
          patternStr = domainMatch[1].toLowerCase();
        } else {
          // Derive a clean domain/pattern
          const cleanNameKey = suggestedName.toLowerCase().replace(/\s+ai\b/g, '').replace(/[^a-z0-9-]/g, '');
          patternStr = `${cleanNameKey}.ai`;
        }

        return {
          name: suggestedName,
          pattern: patternStr,
          type: 'WEB',
        };
      }
    }
  }

  // 2. Check desktop process name if it looks like an AI application
  if (cleanProc && !isBlacklistedSystemProcess(cleanProc)) {
    const lowerProc = cleanProc.toLowerCase();
    if (
      (lowerProc.endsWith('ai') || lowerProc.includes('gpt') || lowerProc.includes('llm') || lowerProc.includes('copilot') || lowerProc.includes('ollama') || lowerProc.includes('lmstudio') || lowerProc.includes('cursor') || lowerProc.includes('windsurf')) &&
      !NON_AI_FALSE_POSITIVES.some(w => lowerProc.includes(w))
    ) {
      const suggestedName = cleanProc.charAt(0).toUpperCase() + cleanProc.slice(1);
      return {
        name: suggestedName,
        pattern: cleanProc + '.exe',
        type: 'APP',
      };
    }
  }

  return null;
}


function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

