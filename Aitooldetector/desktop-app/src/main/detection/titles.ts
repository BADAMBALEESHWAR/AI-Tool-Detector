import { normalizeSeparators } from './catalog';

/** Browser executables (lower-case, no ".exe") and how they are shown to admins. */
const BROWSERS: Record<string, string> = {
  chrome: 'Google Chrome',
  msedge: 'Microsoft Edge',
  brave: 'Brave Browser',
  opera: 'Opera',
  opera_gx: 'Opera GX',
  vivaldi: 'Vivaldi',
  chromium: 'Chromium',
  thorium: 'Thorium',
  yandex: 'Yandex Browser',
  firefox: 'Mozilla Firefox',
  floorp: 'Floorp',
  waterfox: 'Waterfox',
  librewolf: 'LibreWolf',
  zen: 'Zen Browser',
  arc: 'Arc',
  safari: 'Safari',
  'google chrome': 'Google Chrome',
  'microsoft edge': 'Microsoft Edge',
  'brave browser': 'Brave Browser',
};

/** Friendly names for apps that host built-in AI features. */
const HOST_APPS: Record<string, string> = {
  code: 'Visual Studio Code',
  'code - insiders': 'VS Code Insiders',
  vscodium: 'VSCodium',
  devenv: 'Visual Studio',
  winword: 'Microsoft Word',
  excel: 'Microsoft Excel',
  powerpnt: 'Microsoft PowerPoint',
  outlook: 'Microsoft Outlook',
  olk: 'Microsoft Outlook',
  onenote: 'Microsoft OneNote',
  notion: 'Notion',
  acrobat: 'Adobe Acrobat',
  acrord32: 'Adobe Acrobat Reader',
};

export function processKey(name: string): string {
  return name.trim().toLowerCase().replace(/\.exe$/, '');
}

export function browserName(process: string): string | null {
  return BROWSERS[processKey(process)] || null;
}

export function hostAppName(process: string): string {
  const key = processKey(process);
  return HOST_APPS[key] || BROWSERS[key] || process.replace(/\.exe$/i, '');
}

// Suffixes browsers append to window and tab titles.
const BROWSER_SUFFIX = /\s+[-–—]\s+(Google Chrome|Microsoft​?\s*Edge|Brave|Mozilla Firefox|Firefox|Opera|Opera GX|Vivaldi|Chromium|Arc|Thorium|Yandex|Floorp|Waterfox|LibreWolf|Zen Browser|Safari)$/i;
// Tab status Chrome/Brave/Edge append in the tab strip ("- Memory usage - 314 MB").
const TAB_STATUS = /\s+-\s+(High memory usage|Memory usage|Audio playing|Tab muted|Muted|Camera recording|Microphone recording|Recording|Sharing (?:your )?screen|Network error|Crashed|Pinned|Loading|Not responding)\b.*$/i;
// Edge window titles: "<page> and 3 more pages - <profile> - Microsoft Edge".
const EDGE_MORE_PAGES = /\s+and\s+\d+\s+more\s+pages?.*$/i;

/** Cleans a browser tab or window title down to the page title. */
export function cleanPageTitle(raw: string): string {
  let t = (raw || '').replace(/[​-‏﻿]/g, '').trim();
  let prev = '';
  while (prev !== t) {
    prev = t;
    t = t.replace(TAB_STATUS, '').replace(BROWSER_SUFFIX, '').replace(EDGE_MORE_PAGES, '').trim();
  }
  t = t.replace(/^\(\d+\+?\)\s*/, '').replace(/^[●•*]\s*/, '');
  return normalizeSeparators(t);
}

/** Page-title segments, lower-case ("Fix CSS - Claude" → ["fix css", "claude"]). */
export function titleSegments(cleanTitle: string): string[] {
  return cleanTitle.toLowerCase().split(' - ').map(s => s.trim()).filter(Boolean);
}

/**
 * Sites whose page titles often contain AI brand names without the user using
 * any AI tool ("ChatGPT explained - YouTube", "Claude - Wikipedia"). A title
 * with one of these as a segment never counts as AI use by title alone.
 */
export const NON_AI_SITES = new Set([
  'youtube', 'google search', 'google', 'search', 'bing', 'duckduckgo', 'yahoo search', 'ecosia',
  'wikipedia', 'reddit', 'quora', 'medium', 'substack', 'linkedin', 'x', 'twitter', 'facebook',
  'instagram', 'threads', 'tiktok', 'pinterest', 'github', 'gitlab', 'stack overflow', 'dev community',
  'gmail', 'outlook', 'google docs', 'google drive', 'google sheets', 'google slides', 'google news',
  'the verge', 'techcrunch', 'wired', 'bbc news', 'cnn', 'forbes', 'the guardian', 'the new york times',
  'amazon.in', 'amazon.com', 'flipkart', 'netflix', 'spotify', 'whatsapp', 'telegram', 'discord',
  'microsoft learn', 'apple', 'app store', 'google play', 'chrome web store', 'microsoft store',
]);
