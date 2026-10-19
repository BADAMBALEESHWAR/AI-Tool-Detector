import { describe, expect, it } from 'vitest';
import bundled from '../../data/ai-tools.json';
import { CatalogTool, compileCatalog, parseMarker, scannerRules } from './catalog';
import { ScanSnapshot, detect, findCandidates, matchWebTitle } from './engine';
import { cleanPageTitle } from './titles';

const catalog = compileCatalog(bundled.tools as CatalogTool[], bundled.catalogVersion);
const toolFor = (title: string) => matchWebTitle(catalog.web, title)?.toolName ?? null;
const snapshot = (s: Partial<ScanSnapshot>): ScanSnapshot => ({ windows: [], tabs: [], processes: [], markers: [], ...s });

describe('cleanPageTitle', () => {
  it.each([
    ['Instances | EC2 | ap-south-1 - Memory usage - 783 MB', 'Instances - EC2 - ap-south-1'],
    ['(9) WhatsApp - High memory usage - 938 MB', 'WhatsApp'],
    ['student-dashboardtooldetect.in - Network error', 'student-dashboardtooldetect.in'],
    ["SVKM's NMIMS · AI Integrity Monitor — Student Portal - Google Chrome", "SVKM's NMIMS - AI Integrity Monitor - Student Portal"],
    ['Fix flexbox gap - Claude - Audio playing', 'Fix flexbox gap - Claude'],
    ['ChatGPT and 3 more pages - Personal - Microsoft​ Edge', 'ChatGPT'],
  ])('%s', (raw, expected) => {
    expect(cleanPageTitle(raw)).toBe(expected);
  });
});

describe('web chatbots are detected from real tab titles', () => {
  it.each([
    ['ChatGPT', 'ChatGPT'],
    ['ChatGPT - Memory usage - 120 MB', 'ChatGPT'],
    ['Google Gemini', 'Google Gemini'],
    ['Fix flexbox gap - Claude', 'Claude'],
    ['why is the sky blue - Perplexity', 'Perplexity'],
    ['DeepSeek - Into the Unknown', 'DeepSeek'],
    ['Copilot · GitHub', 'GitHub Copilot'],
    ['Microsoft Copilot: Your AI companion', 'Microsoft Copilot'],
    ['Poe - Fast, Helpful AI Chat', 'Poe'],
    ['Phind: AI search engine', 'Phind'],
    ['Le Chat - Mistral AI', 'Mistral Le Chat'],
    ['QuillBot AI - Paraphrasing Tool', 'QuillBot'],
    ['NotebookLM', 'NotebookLM'],
    ['Untitled notebook - NotebookLM', 'NotebookLM'],
    ['Visit chat.deepseek.com now', 'DeepSeek'],
  ])('"%s" → %s', (title, tool) => {
    expect(toolFor(title)).toBe(tool);
  });
});

describe('pages that only mention AI are not detected (old false positives)', () => {
  it.each([
    '(598) YouTube',
    'ChatGPT explained in 10 minutes - YouTube',
    'ChatGPT - YouTube',
    'Claude (language model) - Wikipedia',
    'chatgpt.com - Google Search',
    'how to use gemini - Google Search',
    'Anthropic releases Claude 5 | TechCrunch',
    'GitHub - anthropics/claude-code: Claude Code CLI',
    'AI Integrity Monitor — Admin',
    "SVKM's NMIMS · AI Integrity Monitor — Student Portal",
    'Drive revenue by selling in AWS Marketplace',
    'AI explained: what is an agent? - The Verge',
    'my-site.github.io - personal assistant app',
    'Trip.com: Book cheap flights, hotels, car rentals, trains and more',
    'Raspberry Pi - Teach, learn, and make with Raspberry Pi',
    'Notion - Project notes',
    'New Tab',
  ])('"%s"', title => {
    expect(toolFor(title)).toBeNull();
  });
});

describe('detect()', () => {
  it('reports a chatbot tab with its browser as the surface', () => {
    const d = detect(snapshot({ tabs: [{ process: 'chrome', title: 'Fix flexbox gap - Claude - Memory usage - 90 MB' }] }), catalog);
    expect(d).toEqual([expect.objectContaining({ toolName: 'Claude', kind: 'WEB', surface: 'Google Chrome', evidence: 'Tab "Fix flexbox gap - Claude"' })]);
  });

  it('ignores AI-looking titles in non-browser windows', () => {
    const d = detect(snapshot({ windows: [{ process: 'notepad', title: 'ChatGPT' }, { process: 'WINWORD', title: 'Claude essay.docx - Word' }] }), catalog);
    expect(d).toEqual([]);
  });

  it('detects AI desktop apps by executable, case-insensitively', () => {
    const d = detect(snapshot({ processes: ['explorer.exe', 'ChatGPT.exe', 'ollama app.exe', 'Code.exe'] }), catalog);
    expect(d.map(x => x.toolName).sort()).toEqual(['ChatGPT Desktop', 'Ollama']);
    expect(d.every(x => x.surface === 'Desktop Application')).toBe(true);
  });

  it('never detects itself or general apps', () => {
    const d = detect(snapshot({ processes: ['AI Monitor.exe', 'TabScanner.exe', 'Notion.exe', 'WINWORD.EXE', 'chrome.exe'] }), catalog);
    expect(d).toEqual([]);
  });

  it('reports built-in AI from a scanner marker on its host app', () => {
    const rule = catalog.markers.find(m => m.toolName === 'Claude Code (VS Code)')!;
    const d = detect(snapshot({ markers: [{ process: 'Code', ruleId: rule.ruleId }] }), catalog);
    expect(d).toEqual([expect.objectContaining({ toolName: 'Claude Code (VS Code)', kind: 'EMBEDDED', surface: 'Visual Studio Code' })]);
  });

  it('rejects a marker reported by the wrong host process', () => {
    const rule = catalog.markers.find(m => m.toolName === 'Microsoft 365 Copilot (Office)')!;
    expect(detect(snapshot({ markers: [{ process: 'notepad', ruleId: rule.ruleId }] }), catalog)).toEqual([]);
  });

  it('matches window-title markers in TypeScript', () => {
    const d = detect(snapshot({ windows: [{ process: 'Notion', title: 'Notion AI' }, { process: 'Notion', title: 'Meeting notes' }] }), catalog);
    expect(d.map(x => `${x.toolName}@${x.surface}`)).toEqual(['Notion AI (desktop)@Notion']);
  });

  it('deduplicates the same tool on the same surface', () => {
    const d = detect(snapshot({
      tabs: [{ process: 'chrome', title: 'ChatGPT' }, { process: 'chrome', title: 'ChatGPT' }],
      windows: [{ process: 'chrome', title: 'ChatGPT - Google Chrome' }],
    }), catalog);
    expect(d).toHaveLength(1);
  });

  it('keeps separate sessions per browser', () => {
    const d = detect(snapshot({ tabs: [{ process: 'chrome', title: 'ChatGPT' }, { process: 'brave', title: 'ChatGPT' }] }), catalog);
    expect(d.map(x => x.surface).sort()).toEqual(['Brave Browser', 'Google Chrome']);
  });
});

describe('findCandidates()', () => {
  it('suggests unknown .ai domains shown in browser titles', () => {
    const c = findCandidates(snapshot({ tabs: [{ process: 'chrome', title: 'Welcome to studybuddy.ai' }] }), catalog);
    expect(c).toEqual([expect.objectContaining({ pattern: 'studybuddy.ai', type: 'WEB', name: 'Studybuddy AI' })]);
  });

  it('does not suggest pages that merely mention AI, known tools or blocked sites', () => {
    const c = findCandidates(snapshot({
      tabs: [
        { process: 'chrome', title: 'Top 10 AI agents for students' },
        { process: 'chrome', title: 'claude.ai' },
        { process: 'chrome', title: 'studybuddy.ai - Google Search' },
      ],
      windows: [{ process: 'notepad', title: 'notes about cool.ai' }],
    }), catalog);
    expect(c).toEqual([]);
  });

  it('suggests unknown executables that look like local LLM apps', () => {
    const c = findCandidates(snapshot({ processes: ['mygpt-runner.exe', 'gpt4all.exe', 'notepad.exe', 'OmenInstallMonitor.exe', 'smallmodel.exe'] }), catalog);
    expect(c.map(x => x.pattern)).toEqual(['mygpt-runner.exe']);
  });
});

describe('catalog', () => {
  it('parses marker syntax', () => {
    expect(parseMarker('Pane=Copilot')).toEqual({ controlType: 'Pane', prefix: false, text: 'Copilot' });
    expect(parseMarker('Edit^Chat Input')).toEqual({ controlType: 'Edit', prefix: true, text: 'Chat Input' });
    expect(parseMarker('=Any type')).toEqual({ controlType: '', prefix: false, text: 'Any type' });
    expect(parseMarker('no operator')).toBeNull();
    expect(parseMarker('Pane=')).toBeNull();
  });

  it('every bundled tool compiles, and every embedded tool has a marker', () => {
    const embedded = bundled.tools.filter(t => t.type === 'EMBEDDED');
    for (const t of embedded) expect(catalog.markers.some(m => m.toolId === t.id)).toBe(true);
    expect(catalog.web.length + catalog.markers.length).toBeGreaterThan(50);
  });

  it('writes scanner rules without window-title markers', () => {
    const lines = scannerRules(catalog).split('\n');
    expect(lines.every(l => l.split('|').length === 5)).toBe(true);
    expect(lines.some(l => l.includes('|Window|'))).toBe(false);
    expect(lines).toContain('claude-code-vscode#0|code,code - insiders,vscodium|Group|=|Claude Code conversation');
  });

  it('skips pending and rejected tools', () => {
    const c = compileCatalog([
      { id: 'a', name: 'Pending', type: 'WEB', pattern: 'pending.ai', keywords: ['Pending'], status: 'PENDING' },
      { id: 'b', name: 'Rejected', type: 'APP', pattern: 'rejected.exe', status: 'REJECTED' },
    ]);
    expect(c.web).toEqual([]);
    expect(c.apps.size).toBe(0);
  });
});
