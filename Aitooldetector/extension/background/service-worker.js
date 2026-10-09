// AI Monitor Browser Extension — Service Worker (MV3)
// Tracks AI tool usage via URL/domain matching and heuristics
// Privacy: only domain, page title, timestamps — never content

// ── Built-in AI tool domains ──────────────────────────────────────────────────
const AI_TOOL_DOMAINS = [
  { id: 'chatgpt', name: 'ChatGPT', domains: ['chatgpt.com', 'chat.openai.com', 'openai.com'] },
  { id: 'gemini', name: 'Google Gemini', domains: ['gemini.google.com', 'bard.google.com'] },
  { id: 'claude', name: 'Claude', domains: ['claude.ai', 'anthropic.com'] },
  { id: 'copilot', name: 'Microsoft Copilot', domains: ['copilot.microsoft.com', 'bing.com/chat', 'bing.com/copilot'] },
  { id: 'github-copilot', name: 'GitHub Copilot', domains: ['github.com/copilot', 'copilot.github.com'] },
  { id: 'perplexity', name: 'Perplexity AI', domains: ['perplexity.ai', 'www.perplexity.ai'] },
  { id: 'deepseek', name: 'DeepSeek', domains: ['deepseek.com', 'chat.deepseek.com'] },
  { id: 'grok', name: 'Grok', domains: ['grok.com', 'x.com/grok', 'grok.x.ai'] },
  { id: 'replit', name: 'Replit', domains: ['replit.com', 'replit.dev', 'repl.it'] },
  { id: 'mistral', name: 'Mistral Le Chat', domains: ['chat.mistral.ai', 'mistral.ai'] },
  { id: 'poe', name: 'Poe', domains: ['poe.com', 'www.poe.com'] },
  { id: 'character-ai', name: 'Character.AI', domains: ['character.ai', 'c.ai', 'beta.character.ai'] },
  { id: 'huggingface', name: 'HuggingFace Chat', domains: ['huggingface.co', 'huggingface.co/chat'] },
  { id: 'aistudio', name: 'Google AI Studio', domains: ['aistudio.google.com', 'makersuite.google.com'] },
  { id: 'notebooklm', name: 'Google NotebookLM', domains: ['notebooklm.google.com', 'notebooklm.google'] },
  { id: 'bolt', name: 'Bolt.new', domains: ['bolt.new', 'bolt.diy', 'stackblitz.com/bolt'] },
  { id: 'lovable', name: 'Lovable', domains: ['lovable.dev', 'lovable.app'] },
  { id: 'blackbox', name: 'Blackbox AI', domains: ['blackbox.ai', 'www.blackbox.ai'] },
  { id: 'phind', name: 'Phind', domains: ['phind.com', 'www.phind.com'] },
  { id: 'v0', name: 'v0 by Vercel', domains: ['v0.dev', 'v0.app'] },
  { id: 'midjourney', name: 'Midjourney', domains: ['midjourney.com', 'alpha.midjourney.com'] },
  { id: 'youcom', name: 'You.com', domains: ['you.com', 'www.you.com'] },
  { id: 'pi', name: 'Pi AI', domains: ['pi.ai', 'heypi.com'] },
  { id: 'meta-ai', name: 'Meta AI', domains: ['meta.ai', 'ai.meta.com'] },
  { id: 'kimi', name: 'Kimi', domains: ['kimi.ai', 'kimi.moonshot.cn'] },
  { id: 'cohere', name: 'Cohere Coral', domains: ['coral.cohere.com', 'cohere.com'] },
  { id: 'jasper', name: 'Jasper AI', domains: ['jasper.ai', 'app.jasper.ai'] },
  { id: 'writesonic', name: 'Writesonic', domains: ['writesonic.com', 'app.writesonic.com'] },
  { id: 'copyai', name: 'Copy.ai', domains: ['copy.ai', 'app.copy.ai'] },
  { id: 'qwen', name: 'Qwen', domains: ['chat.qwenlm.ai', 'qwen.ai', 'tongyi.aliyun.com'] },
  { id: 'elevenlabs', name: 'ElevenLabs', domains: ['elevenlabs.io', 'beta.elevenlabs.io'] },
  { id: 'suno', name: 'Suno AI', domains: ['suno.com', 'suno.ai', 'app.suno.ai'] },
  { id: 'udio', name: 'Udio', domains: ['udio.com', 'www.udio.com'] },
  { id: 'runway', name: 'Runway', domains: ['runwayml.com', 'app.runwayml.com', 'runway.com'] },
  { id: 'gamma', name: 'Gamma App', domains: ['gamma.app', 'www.gamma.app'] },
  { id: 'chatpdf', name: 'ChatPDF', domains: ['chatpdf.com', 'www.chatpdf.com'] },
  { id: 'notion', name: 'Notion AI', domains: ['notion.so', 'www.notion.so'] },
];

// Non-AI popular domains that should never be flagged as heuristic AI tools
const NON_AI_POPULAR_DOMAINS = [
  'google.com', 'youtube.com', 'wikipedia.org', 'github.com', 'stackoverflow.com',
  'yahoo.com', 'reddit.com', 'linkedin.com', 'twitter.com', 'x.com', 'facebook.com',
  'amazon.com', 'microsoft.com', 'apple.com', 'netflix.com', 'instagram.com',
  'spotify.com', 'gmail.com', 'office.com', 'docs.google.com', 'drive.google.com'
];

const DOMAIN_AI_REGEX = /(^|\.)(chatgpt|openai|gemini|claude|copilot|perplexity|deepseek|grok|mistral|aistudio|notebooklm|anthropic|midjourney|elevenlabs|suno|udio|runwayml|runway|lovable|blackbox|phind|ollama|lmstudio|manus|kling|ideogram|v0|bolt|replit|qwen|kimi|cohere|poe|character|jasper|writesonic|gamma|chatpdf|genspark|recraft|flux|openrouter|einsia)(\.|$)/i;
const GENERIC_AI_SUBDOMAIN_REGEX = /(^|\.)(chat|bot|llm|copilot|assistant|ai|app|agent)\.[a-z0-9-]+\.(ai|io|dev|app|com|net|org)$/i;
const TITLE_HEURISTIC_REGEX = /\b(ai\s*chat|ai\s*assistant|ai\s*copilot|ai\s*bot|ai\s*studio|generative\s*ai|llm\s*chat|prompt\s*engineering|ai\s*video|ai\s*music|ai\s*voice|ai\s*generator|ai\s*writer|ai\s*agent|ai\s*editor|ai\s*workspace|artificial\s*intelligence|neural|llm|gpt|copilot)\b|\bAI\b/i;


// API config (read from storage, written by desktop app or set via options page)
// Falls back to localhost only for local development.
const DEFAULT_API_BASE = 'http://localhost:3001/api';

async function getApiBase() {
  const { apiBase } = await chrome.storage.local.get(['apiBase']);
  return apiBase || DEFAULT_API_BASE;
}

// ── Token refresh ────────────────────────────────────────────────────────────
async function tryRefreshToken() {
  const { refreshToken } = await chrome.storage.local.get(['refreshToken']);
  if (!refreshToken) {
    console.warn('[AI Monitor] No refresh token — cannot refresh access token');
    return false;
  }
  const apiBase = await getApiBase();
  try {
    const res = await fetch(`${apiBase}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (res.ok) {
      const data = await res.json();
      await chrome.storage.local.set({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
      console.log('[AI Monitor] Token refreshed successfully');
      return true;
    } else {
      console.warn('[AI Monitor] Token refresh failed — clearing session');
      await chrome.storage.local.remove(['accessToken', 'refreshToken', 'deviceId', 'studentInfo']);
      return false;
    }
  } catch (err) {
    console.error('[AI Monitor] Token refresh error:', err);
    return false;
  }
}

// Active sessions: tabId -> { toolName, toolId, startTime, domain }
const activeSessions = new Map();

// ── Auth: read token written by desktop app ──────────────────────────────────
async function getAuthToken() {
  const stored = await chrome.storage.local.get(['accessToken', 'deviceId', 'deviceToken', 'studentInfo']);
  return stored;
}

async function loadSyncedTools() {
  const stored = await chrome.storage.local.get(['syncedTools']);
  return stored.syncedTools || [];
}

// ── Domain matching ──────────────────────────────────────────────────────────
function matchDomain(hostname) {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  // Check synced tools first (updated by backend)
  // Then check built-in list
  for (const tool of AI_TOOL_DOMAINS) {
    for (const domain of tool.domains) {
      const d = domain.toLowerCase().replace(/^www\./, '');
      if (host === d || host.endsWith('.' + d)) {
        return tool;
      }
    }
  }
  return null;
}

function matchDomainInSynced(hostname, syncedTools) {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  for (const tool of syncedTools) {
    const pattern = (tool.pattern || '').toLowerCase().replace(/^www\./, '');
    if (host === pattern || host.endsWith('.' + pattern)) {
      return { id: tool.id, name: tool.name };
    }
    for (const alias of (tool.aliases || [])) {
      const a = alias.toLowerCase().replace(/^www\./, '');
      if (host === a || host.endsWith('.' + a)) {
        return { id: tool.id, name: tool.name };
      }
    }
  }
  return null;
}

// ── Heuristic check for unknown domains ──────────────────────────────────────
function isHeuristicAITool(hostname, title) {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  const titleLower = (title || '').toLowerCase();

  // Any domain with .ai TLD or recognized brand/subdomain
  const domainMatch = host.endsWith('.ai') || DOMAIN_AI_REGEX.test(host) || GENERIC_AI_SUBDOMAIN_REGEX.test(host);

  // Guard: ignore common non-AI domains if not an explicit AI tool subdomain
  if (!domainMatch) {
    for (const nonAi of NON_AI_POPULAR_DOMAINS) {
      if (host === nonAi || host.endsWith('.' + nonAi)) {
        return false;
      }
    }
  }

  const titleMatch = TITLE_HEURISTIC_REGEX.test(titleLower);
  return domainMatch || titleMatch;
}


// ── Send real-time session-opened ping (no DB record, instant admin alert) ───
async function sendSessionPing(session) {
  let auth = await getAuthToken();
  if (!auth.accessToken) {
    console.warn('[AI Monitor] No access token for ping — trying refresh');
    const refreshed = await tryRefreshToken();
    if (!refreshed) return;
    auth = await getAuthToken();
  }
  if (!auth.deviceId) {
    console.warn('[AI Monitor] No deviceId for ping — skipping');
    return;
  }

  const apiBase = await getApiBase();
  const browserName = session.browserName || detectBrowser();
  const sessionKey = `${session.toolId || session.toolName}:${browserName}`;

  try {
    const res = await fetch(`${apiBase}/usage/ping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify({
        deviceId: auth.deviceId,
        toolName: session.toolName,
        toolId: session.toolId || undefined,
        source: 'BROWSER_EXTENSION',
        startTime: new Date(session.startTime).toISOString(),
        rawIdentifier: session.domain,
        browserName,
        isUnknownTool: !session.toolId,
        sessionKey,
        eventType: 'ACTIVE',
      }),
    });
    if (res.status === 401) {
      console.warn('[AI Monitor] Ping got 401 — refreshing token');
      await tryRefreshToken();
    } else if (!res.ok) {
      const body = await res.text();
      console.error(`[AI Monitor] Ping failed (${res.status}):`, body);
    } else {
      console.log(`[AI Monitor] Ping sent: ${session.toolName}`);
    }
  } catch (err) {
    console.warn('[AI Monitor] Ping network error:', err);
  }
}

// ── Send usage event to backend ──────────────────────────────────────────────
async function sendUsageEvent(session, endTime) {
  let auth = await getAuthToken();
  if (!auth.accessToken) {
    console.warn('[AI Monitor] No access token for usage event — trying refresh');
    const refreshed = await tryRefreshToken();
    if (!refreshed) return;
    auth = await getAuthToken();
  }
  if (!auth.deviceId) {
    console.warn('[AI Monitor] No deviceId — cannot send usage event');
    return;
  }

  const durationSeconds = Math.floor((endTime - session.startTime) / 1000);
  if (durationSeconds < 2) return; // Ignore very short visits

  const browserName = session.browserName || detectBrowser();
  const sessionKey = `${session.toolId || session.toolName}:${browserName}`;
  const apiBase = await getApiBase();

  try {
    const res = await fetch(`${apiBase}/usage/event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify({
        deviceId: auth.deviceId,
        toolName: session.toolName,
        toolId: session.toolId,
        source: 'BROWSER_EXTENSION',
        startTime: new Date(session.startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        durationSeconds,
        rawIdentifier: session.domain,
        browserName,
        isUnknownTool: !session.toolId,
        sessionKey,
        eventType: 'DEACTIVATED',
      }),
    });
    if (res.status === 401) {
      console.warn('[AI Monitor] Usage event got 401 — refreshing token');
      await tryRefreshToken();
    } else if (!res.ok) {
      const body = await res.text();
      console.error(`[AI Monitor] Usage event failed (${res.status}):`, body);
    } else {
      console.log(`[AI Monitor] Usage event sent: ${session.toolName} (${durationSeconds}s)`);
    }
  } catch (err) {
    console.error('[AI Monitor] Failed to send usage event (network):', err);
  }
}

// ── Flag unknown tool ────────────────────────────────────────────────────────
async function flagUnknownTool(hostname, title) {
  let auth = await getAuthToken();
  if (!auth.accessToken) {
    const refreshed = await tryRefreshToken();
    if (!refreshed) return;
    auth = await getAuthToken();
  }

  // Clean suggested name from window/page title (handles \uFF1A, :, -, |, etc.)
  const titleParts = (title || '').split(/\s*[\uFF1A:–—|·•/\\-]+\s*/).map(s => s.trim()).filter(Boolean);
  let suggestedName = (titleParts.length > 0 && titleParts[0].length >= 2 && titleParts[0].length <= 35)
    ? titleParts[0]
    : hostname;

  if (!suggestedName.toLowerCase().includes('ai') && !suggestedName.toLowerCase().includes('gpt') && !suggestedName.toLowerCase().includes('chat')) {
    if (suggestedName.length <= 15 && suggestedName.length > 2) {
      suggestedName = `${suggestedName} AI`;
    }
  }


  const apiBase = await getApiBase();

  try {
    const res = await fetch(`${apiBase}/tools/flag`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify({
        pattern: hostname,
        suggestedName,
        type: 'WEB',
        rawIdentifier: title || hostname,
      }),
    });
    if (res.status === 401) {
      await tryRefreshToken();
    }
  } catch {
    // Silently ignore
  }
}


// ── Detect browser name ───────────────────────────────────────────────────────
function detectBrowser() {
  const ua = navigator?.userAgent || '';
  if (ua.includes('Edg/')) return 'Microsoft Edge';
  if (ua.includes('OPR/') || ua.includes('Opera/')) return 'Opera';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Brave/') || ua.includes('brave')) return 'Brave';
  if (ua.includes('Chrome/')) return 'Chrome';
  return 'Unknown Browser';
}

// ── Session management ────────────────────────────────────────────────────────
async function startSession(tabId, tool, domain) {
  // End any existing session for this tab
  await endSession(tabId);

  const session = {
    toolId: tool.id,
    toolName: tool.name,
    domain,
    startTime: Date.now(),
  };
  activeSessions.set(tabId, session);

  console.log(`[AI Monitor] ✅ DETECTED: ${tool.name} (domain: ${domain}) on tab ${tabId}`);

  // ⚡ Immediately notify admin (real-time ping — no DB record)
  await sendSessionPing(session);
}

async function endSession(tabId) {
  const session = activeSessions.get(tabId);
  if (!session) return;

  activeSessions.delete(tabId);
  await sendUsageEvent(session, Date.now());
  console.log(`[AI Monitor] Session ended: ${session.toolName}`);
}

// ── Tab event listeners ───────────────────────────────────────────────────────
async function handleTabUrl(tabId, url, title) {
  if (!url || url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('moz-extension://')) {
    await endSession(tabId);
    return;
  }

  let hostname;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return;
  }

  // Check synced tools first
  const syncedTools = await loadSyncedTools();
  let tool = matchDomainInSynced(hostname, syncedTools);

  // Check built-in list
  if (!tool) {
    tool = matchDomain(hostname);
  }

  if (tool) {
    const currentSession = activeSessions.get(tabId);
    if (!currentSession || currentSession.toolId !== tool.id) {
      await startSession(tabId, tool, hostname);
    }
  } else {
    // End any active session (navigated away from AI tool)
    await endSession(tabId);

    // Heuristic check for unknown tools
    if (isHeuristicAITool(hostname, title)) {
      console.log(`[AI Monitor] Heuristic match: ${hostname}`);
      await flagUnknownTool(hostname, title);
    }
  }
}

// ── Sync tools from backend ──────────────────────────────────────────────────
async function syncToolsFromBackend() {
  const auth = await getAuthToken();
  if (!auth.accessToken) return;
  const apiBase = await getApiBase();

  try {
    const res = await fetch(`${apiBase}/tools`, {
      headers: { 'Authorization': `Bearer ${auth.accessToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      await chrome.storage.local.set({ syncedTools: data.tools });
      console.log(`[AI Monitor] Synced ${data.tools.length} tools from backend`);
    }
  } catch {
    // Silently ignore sync failures
  }
}

// ── Event listeners ──────────────────────────────────────────────────────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    await handleTabUrl(tabId, tab.url, tab.title || '');
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab?.url) {
    await handleTabUrl(tabId, tab.url, tab.title || '');
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await endSession(tabId);
});

// Window focus changed (pause/resume timing)
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Browser lost focus — sessions continue (we track total time, not focus time)
  }
});

// ── Alarms for periodic sync ──────────────────────────────────────────────────
chrome.alarms.create('sync-tools', { periodInMinutes: 5 });
chrome.alarms.create('flush-sessions', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sync-tools') {
    await syncToolsFromBackend();
  }
  if (alarm.name === 'flush-sessions') {
    // Flush sessions for tabs that are no longer active, or side panel sessions inactive for > 3 min
    const tabs = await chrome.tabs.query({});
    const activeTabIds = new Set(tabs.map(t => t.id));
    const now = Date.now();
    for (const [key, session] of activeSessions) {
      if (typeof key === 'string' && key.startsWith('sidepanel_')) {
        // Conclude side panel sessions after 3 minutes without new subframe activity
        if (now - (session.lastActiveTime || session.startTime) > 3 * 60 * 1000) {
          await endSession(key);
        }
      } else if (!activeTabIds.has(key)) {
        await endSession(key);
      }
    }
  }
});

// ── Messages from content script ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'HEURISTIC_MATCH' && sender.tab) {
    console.log(`[AI Monitor] Content script heuristic: ${message.hostname}`);
    flagUnknownTool(message.hostname, message.title);
  }
  if (message.type === 'sync-tools') {
    syncToolsFromBackend();
  }
});

// ── WebNavigation listener for subframes, iframes, and Side Panels ────────────
if (chrome.webNavigation && chrome.webNavigation.onCommitted) {
  chrome.webNavigation.onCommitted.addListener(async (details) => {
    // Check if navigation is a subframe or side panel
    if (details.url && (details.frameId > 0 || details.tabId === -1)) {
      try {
        const hostname = new URL(details.url).hostname.replace(/^www\./, '');
        const syncedTools = await loadSyncedTools();
        let tool = matchDomainInSynced(hostname, syncedTools) || matchDomain(hostname);
        if (tool) {
          const sideSessionKey = `sidepanel_${tool.id}`;
          const current = activeSessions.get(sideSessionKey);
          if (!current) {
            const browserName = `${detectBrowser()} (Side Panel)`;
            const session = {
              toolId: tool.id,
              toolName: tool.name,
              domain: hostname,
              startTime: Date.now(),
              lastActiveTime: Date.now(),
              browserName,
            };
            activeSessions.set(sideSessionKey, session);
            console.log(`[AI Monitor] 📱 DETECTED SIDE PANEL: ${tool.name} (${hostname})`);
            await sendSessionPing(session);
          } else {
            // Keep side panel session alive on activity
            current.lastActiveTime = Date.now();
          }
        }
      } catch {}
    }
  });
}

// ── Initial sync on install/update ───────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  syncToolsFromBackend();
  console.log('[AI Monitor] Extension installed/updated');
});

// Sync on startup
syncToolsFromBackend();

console.log('[AI Monitor] Service worker started');
