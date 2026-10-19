/**
 * Built-in AI tool catalog — the single source of truth for detection.
 *
 * Synced to every desktop client via GET /api/tools and bundled into the
 * desktop app as an offline fallback (`npm run catalog:export`). Bump
 * AI_CATALOG_VERSION whenever an entry changes; the backend upgrades the
 * database's built-in tools on start-up (see utils/catalogSync.ts).
 *
 * Only real AI products belong here: chatbots, AI apps and AI features built
 * into other applications. General-purpose sites and apps (Notion, Replit,
 * VS Code itself…) must never match on their own.
 *
 * Field meaning per type:
 *
 *   WEB       pattern + aliases  domains / URL prefixes (matched by the browser extension, and
 *                                in window titles when a domain is shown)
 *             keywords           tab-title signatures: the whole normalized title, or its first
 *                                or last " - " segment, must equal one of these (case-insensitive)
 *
 *   APP       pattern + aliases  executable names (with or without .exe)
 *             keywords           display names
 *
 *   EMBEDDED  pattern            unique key "embedded:<slug>"
 *             aliases            host executables the feature lives in (e.g. Code, WINWORD)
 *             keywords           UI markers that exist only while the AI panel is OPEN:
 *                                  "<ControlType>=<text>"  exact name   e.g. "Pane=Copilot"
 *                                  "<ControlType>^<text>"  name prefix  e.g. "Edit^Chat Input"
 *                                ControlType is a UI Automation type (Pane, Group, Button,
 *                                Document, Edit…) or "Window" for the top-level window title.
 *                                Markers are matched in-process by the desktop scanner; only the
 *                                matched rule id is reported — never any on-screen text.
 *
 * "verified" in a description means the marker was confirmed on a real
 * Windows machine; "best-effort" markers follow the vendor's documented UI
 * and simply never match if the vendor names the element differently.
 */

export type BuiltinToolType = 'WEB' | 'APP' | 'EMBEDDED';

export interface BuiltinAITool {
  name: string;
  type: BuiltinToolType;
  pattern: string;
  aliases: string[];
  keywords: string[];
  description: string;
}

export const AI_CATALOG_VERSION = 3;

const web = (name: string, domains: string[], titles: string[], description: string): BuiltinAITool => ({
  name,
  type: 'WEB',
  pattern: domains[0],
  aliases: domains.slice(1),
  keywords: titles,
  description,
});

const app = (name: string, executables: string[], description: string): BuiltinAITool => ({
  name,
  type: 'APP',
  pattern: executables[0],
  aliases: executables.slice(1),
  keywords: [name],
  description,
});

const embedded = (name: string, slug: string, hosts: string[], markers: string[], description: string): BuiltinAITool => ({
  name,
  type: 'EMBEDDED',
  pattern: `embedded:${slug}`,
  aliases: hosts,
  keywords: markers,
  description,
});

export const BUILTIN_AI_TOOLS: BuiltinAITool[] = [
  // ── AI chatbots & assistants (web) ────────────────────────────────────────
  web('ChatGPT', ['chatgpt.com', 'chat.openai.com'], ['ChatGPT'], 'OpenAI ChatGPT'),
  web('Google Gemini', ['gemini.google.com', 'bard.google.com'], ['Google Gemini', 'Gemini'], 'Google Gemini'),
  web('Claude', ['claude.ai'], ['Claude'], 'Anthropic Claude'),
  web('Microsoft Copilot', ['copilot.microsoft.com', 'copilot.cloud.microsoft', 'bing.com/chat'], ['Microsoft Copilot', 'Copilot', 'Microsoft 365 Copilot'], 'Microsoft Copilot (consumer and Microsoft 365)'),
  web('GitHub Copilot', ['github.com/copilot'], ['Copilot - GitHub', 'GitHub Copilot'], 'GitHub Copilot chat on github.com'),
  web('Perplexity', ['perplexity.ai'], ['Perplexity'], 'Perplexity AI answer engine'),
  web('DeepSeek', ['chat.deepseek.com', 'deepseek.com'], ['DeepSeek'], 'DeepSeek chat'),
  web('Grok', ['grok.com', 'x.com/i/grok'], ['Grok'], 'xAI Grok'),
  web('Meta AI', ['meta.ai'], ['Meta AI'], 'Meta AI assistant'),
  web('Mistral Le Chat', ['chat.mistral.ai'], ['Le Chat', 'Le Chat - Mistral AI'], 'Mistral AI Le Chat'),
  web('Poe', ['poe.com'], ['Poe'], 'Quora Poe multi-model chat'),
  web('Character.AI', ['character.ai', 'c.ai'], ['Character.AI'], 'Character.AI chatbots'),
  web('HuggingChat', ['huggingface.co/chat'], ['HuggingChat'], 'Hugging Face chat'),
  web('Google AI Studio', ['aistudio.google.com'], ['Google AI Studio'], 'Google AI Studio (Gemini playground)'),
  web('NotebookLM', ['notebooklm.google.com'], ['NotebookLM'], 'Google NotebookLM research assistant'),
  web('Qwen Chat', ['chat.qwen.ai', 'chat.qwenlm.ai'], ['Qwen Chat', 'Qwen'], 'Alibaba Qwen'),
  web('Kimi', ['kimi.com', 'kimi.ai', 'kimi.moonshot.cn'], ['Kimi'], 'Moonshot Kimi'),
  web('Z.ai Chat', ['chat.z.ai'], ['Z.ai Chat'], 'Zhipu GLM chat'),
  web('Pi', ['pi.ai'], ['Pi, your personal AI'], 'Inflection Pi'),
  web('You.com', ['you.com'], ['You.com'], 'You.com AI search'),
  web('Phind', ['phind.com'], ['Phind'], 'Phind AI search for developers'),
  web('Blackbox AI', ['blackbox.ai'], ['BLACKBOX.AI', 'Blackbox AI'], 'Blackbox AI coding chat'),
  web('Genspark', ['genspark.ai'], ['Genspark'], 'Genspark AI agents'),
  web('Manus', ['manus.im'], ['Manus'], 'Manus AI agent'),
  web('Duck.ai', ['duck.ai'], ['Duck.ai'], 'DuckDuckGo AI chat'),
  web('LMArena', ['lmarena.ai'], ['LMArena'], 'LMArena model comparison chat'),

  // ── AI study, writing & research tools (web) ──────────────────────────────
  web('QuillBot', ['quillbot.com'], ['QuillBot', 'QuillBot AI'], 'QuillBot AI paraphraser and writer'),
  web('Gauth', ['gauthmath.com'], ['Gauth'], 'Gauth AI homework solver'),
  web('ChatPDF', ['chatpdf.com'], ['ChatPDF'], 'Chat with PDF documents'),
  web('Consensus', ['consensus.app'], ['Consensus'], 'Consensus AI research search'),
  web('Elicit', ['elicit.com'], ['Elicit'], 'Elicit AI research assistant'),
  web('SciSpace', ['typeset.io', 'scispace.com'], ['SciSpace'], 'SciSpace AI paper reader'),
  web('Jasper', ['jasper.ai', 'app.jasper.ai'], ['Jasper'], 'Jasper AI writer'),
  web('Copy.ai', ['copy.ai', 'app.copy.ai'], ['Copy.ai'], 'Copy.ai writer'),
  web('Writesonic', ['writesonic.com'], ['Writesonic', 'Chatsonic'], 'Writesonic / Chatsonic'),
  web('Gamma', ['gamma.app'], ['Gamma'], 'Gamma AI presentations'),
  web('Notion AI', ['notion.so/ai', 'notion.com/product/ai'], ['Notion AI'], 'Notion AI (only the Notion AI page, not Notion itself)'),

  // ── AI app builders & coding (web) ────────────────────────────────────────
  web('Bolt', ['bolt.new'], ['Bolt'], 'StackBlitz Bolt AI app builder'),
  web('Lovable', ['lovable.dev'], ['Lovable'], 'Lovable AI app builder'),
  web('v0', ['v0.dev', 'v0.app'], ['v0 by Vercel', 'v0'], 'Vercel v0 generative UI'),

  // ── AI image, audio & video generation (web) ──────────────────────────────
  web('Midjourney', ['midjourney.com'], ['Midjourney'], 'Midjourney image generation'),
  web('Leonardo.Ai', ['leonardo.ai'], ['Leonardo.Ai'], 'Leonardo image generation'),
  web('Ideogram', ['ideogram.ai'], ['Ideogram'], 'Ideogram image generation'),
  web('ElevenLabs', ['elevenlabs.io'], ['ElevenLabs'], 'ElevenLabs AI voice'),
  web('Suno', ['suno.com'], ['Suno'], 'Suno AI music'),
  web('Udio', ['udio.com'], ['Udio'], 'Udio AI music'),
  web('Runway', ['runwayml.com', 'app.runwayml.com'], ['Runway'], 'Runway AI video'),
  web('Pika', ['pika.art'], ['Pika'], 'Pika AI video'),
  web('Luma Dream Machine', ['lumalabs.ai/dream-machine', 'dream-machine.lumalabs.ai'], ['Dream Machine', 'Luma Dream Machine'], 'Luma AI video'),
  web('Kling AI', ['klingai.com'], ['Kling AI'], 'Kling AI video'),

  // ── AI desktop applications ───────────────────────────────────────────────
  app('ChatGPT Desktop', ['ChatGPT.exe', 'ChatGPT'], 'OpenAI ChatGPT desktop app'),
  app('Claude (desktop / Claude Code)', ['Claude.exe', 'Claude'], 'Anthropic Claude desktop app, or the Claude Code agent running'),
  app('Perplexity Desktop', ['Perplexity.exe', 'Perplexity'], 'Perplexity desktop app'),
  app('Perplexity Comet', ['comet.exe', 'Comet'], 'Perplexity Comet AI browser'),
  app('Microsoft Copilot App', ['Copilot.exe', 'M365Copilot.exe', 'Microsoft.Copilot.exe'], 'Windows Copilot and Microsoft 365 Copilot apps'),
  app('Cursor', ['Cursor.exe', 'Cursor'], 'Cursor AI code editor'),
  app('Windsurf', ['Windsurf.exe', 'Windsurf'], 'Windsurf AI code editor'),
  app('Antigravity', ['Antigravity.exe', 'Antigravity IDE.exe', 'antigravity-ide.exe'], 'Google Antigravity agentic IDE'),
  app('Trae', ['Trae.exe', 'Trae'], 'Trae AI IDE'),
  app('Kiro', ['Kiro.exe', 'Kiro'], 'Kiro AI IDE'),
  app('Void', ['Void.exe'], 'Void AI code editor'),
  app('PearAI', ['PearAI.exe'], 'PearAI code editor'),
  app('Ollama', ['ollama app.exe', 'ollama.exe', 'ollama'], 'Ollama local LLM runtime'),
  app('LM Studio', ['LM Studio.exe', 'lms.exe'], 'LM Studio local LLM app'),
  app('Jan', ['Jan.exe'], 'Jan local AI assistant'),
  app('GPT4All', ['GPT4All.exe', 'gpt4all.exe'], 'Nomic GPT4All local chat'),
  app('Msty', ['Msty.exe', 'MstyStudio.exe'], 'Msty local and cloud AI chat'),
  app('AnythingLLM', ['AnythingLLM.exe'], 'AnythingLLM desktop'),

  // ── AI built into other applications ─────────────────────────────────────
  embedded('Claude Code (VS Code)', 'claude-code-vscode', ['Code', 'Code - Insiders', 'VSCodium'],
    ['Group=Claude Code conversation'],
    'Claude Code chat panel open inside VS Code (verified)'),
  embedded('GitHub Copilot Chat (VS Code)', 'copilot-chat-vscode', ['Code', 'Code - Insiders'],
    ['Edit^Chat Input'],
    'VS Code Chat / Copilot panel open (best-effort)'),
  embedded('GitHub Copilot Chat (Visual Studio)', 'copilot-chat-visualstudio', ['devenv'],
    ['Pane=GitHub Copilot Chat', 'Window=GitHub Copilot Chat'],
    'Copilot Chat tool window open in Visual Studio (best-effort)'),
  embedded('Microsoft 365 Copilot (Office)', 'm365-copilot-office', ['WINWORD', 'EXCEL', 'POWERPNT', 'OUTLOOK', 'olk', 'ONENOTE'],
    ['Pane=Copilot'],
    'Copilot pane open in Word, Excel, PowerPoint, Outlook or OneNote (best-effort)'),
  embedded('Gemini in Chrome', 'gemini-in-chrome', ['chrome'],
    ['Button=Close Gemini in Chrome'],
    'Gemini side panel open in Google Chrome (verified toolbar button)'),
  embedded('Copilot in Edge', 'copilot-in-edge', ['msedge'],
    ['Document=Copilot'],
    'Copilot sidebar open in Microsoft Edge (best-effort)'),
  embedded('Brave Leo', 'brave-leo', ['brave'],
    ['Document=Leo AI'],
    'Leo AI side panel open in Brave (best-effort)'),
  embedded('Opera Aria', 'opera-aria', ['opera', 'opera_gx'],
    ['Document=Aria'],
    'Aria side panel open in Opera (best-effort)'),
  embedded('Notion AI (desktop)', 'notion-ai-desktop', ['Notion'],
    ['Window=Notion AI'],
    'Notion AI page open in the Notion desktop app (best-effort)'),
  embedded('Acrobat AI Assistant', 'acrobat-ai-assistant', ['Acrobat', 'AcroRd32'],
    ['Pane=AI Assistant'],
    'AI Assistant pane open in Adobe Acrobat (best-effort)'),
];

/** Parses an EMBEDDED marker ("Pane=Copilot", "Edit^Chat Input"); null when malformed. */
export function parseMarker(marker: string): { controlType: string; op: '=' | '^'; text: string } | null {
  const m = /^([A-Za-z]*)([=^])(.+)$/.exec(marker.trim());
  if (!m || !m[3].trim()) return null;
  return { controlType: m[1], op: m[2] as '=' | '^', text: m[3].trim() };
}
