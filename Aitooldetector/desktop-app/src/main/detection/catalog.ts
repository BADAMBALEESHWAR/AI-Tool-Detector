/**
 * Compiles the AI tool catalog (bundled ai-tools.json or GET /api/tools) into
 * fast lookup structures for the detection engine. Field meanings are
 * documented in backend/src/utils/aiToolsPreset.ts.
 */

export type ToolType = 'WEB' | 'APP' | 'EMBEDDED';

/** A catalog entry exactly as the backend returns it. */
export interface CatalogTool {
  id: string;
  name: string;
  type: ToolType | 'UNKNOWN';
  pattern: string;
  aliases?: string[];
  keywords?: string[];
  description?: string | null;
  status?: string;
}

export interface WebRule {
  toolId: string;
  toolName: string;
  domains: string[];      // lower-case hosts without "www." (paths dropped)
  titles: string[];       // normalized, lower-case tab-title signatures
}

export interface MarkerRule {
  ruleId: string;         // "<toolId>#<index>", reported back by the scanner
  toolId: string;
  toolName: string;
  hosts: string[];        // lower-case executable names without ".exe"
  controlType: string;    // UI Automation type, "" for any, "Window" for window titles
  prefix: boolean;
  text: string;
}

export interface CompiledCatalog {
  web: WebRule[];
  apps: Map<string, { toolId: string; toolName: string }>;  // exe (lower, no .exe) → tool
  markers: MarkerRule[];
  version: number;
}

export function exeKey(name: string): string {
  return name.trim().toLowerCase().replace(/\.exe$/, '').replace(/\.app$/, '');
}

export function normalizeSignature(text: string): string {
  return normalizeSeparators(text).toLowerCase();
}

/** Replaces the many title separators (| · • — – :) with a single " - ". */
export function normalizeSeparators(text: string): string {
  return text
    .replace(/[​-‏﻿]/g, '')
    .replace(/\s+[|·•—–]\s+/g, ' - ')
    .replace(/:\s+/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseMarker(marker: string): { controlType: string; prefix: boolean; text: string } | null {
  const m = /^([A-Za-z]*)([=^])(.+)$/.exec(marker.trim());
  if (!m || !m[3].trim()) return null;
  return { controlType: m[1], prefix: m[2] === '^', text: m[3].trim() };
}

export function compileCatalog(tools: CatalogTool[], version = 0): CompiledCatalog {
  const web: WebRule[] = [];
  const apps = new Map<string, { toolId: string; toolName: string }>();
  const markers: MarkerRule[] = [];

  for (const tool of tools) {
    if (!tool?.id || !tool.name || tool.status === 'REJECTED' || tool.status === 'PENDING') continue;
    const values = [tool.pattern, ...(tool.aliases || [])].filter(Boolean);

    if (tool.type === 'WEB') {
      web.push({
        toolId: tool.id,
        toolName: tool.name,
        domains: values
          .map(d => d.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0])
          .filter(d => d.includes('.') && d.length >= 4),
        titles: Array.from(new Set((tool.keywords || []).map(normalizeSignature).filter(t => t.length >= 2))),
      });
    } else if (tool.type === 'APP') {
      for (const exe of values) {
        const key = exeKey(exe);
        if (key.length >= 2 && !apps.has(key)) apps.set(key, { toolId: tool.id, toolName: tool.name });
      }
    } else if (tool.type === 'EMBEDDED') {
      const hosts = (tool.aliases || []).map(exeKey).filter(Boolean);
      if (hosts.length === 0) continue;
      (tool.keywords || []).forEach((kw, i) => {
        const parsed = parseMarker(kw);
        if (!parsed) return;
        markers.push({ ruleId: `${tool.id}#${i}`, toolId: tool.id, toolName: tool.name, hosts, ...parsed });
      });
    }
  }
  return { web, apps, markers, version };
}

/**
 * Rules file consumed by TabScanner --deep: "ruleId|hosts|ControlType|op|text".
 * Window-title markers are evaluated in TypeScript and are not sent.
 */
export function scannerRules(catalog: CompiledCatalog): string {
  return catalog.markers
    .filter(m => m.controlType.toLowerCase() !== 'window')
    .map(m => [m.ruleId, m.hosts.join(','), m.controlType, m.prefix ? '^' : '=', m.text.replace(/[\r\n]/g, ' ')].join('|'))
    .join('\n');
}
