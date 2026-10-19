import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import bundled from '../data/ai-tools.json';
import { CatalogTool, CompiledCatalog, compileCatalog, scannerRules } from './detection/catalog';
import { logger } from './logger';

const syncedPath = () => join(app.getPath('userData'), 'ai-catalog-synced.json');
const rulesPath = () => join(app.getPath('userData'), 'scanner-rules.txt');

let compiled: CompiledCatalog | null = null;
let rulesWritten = false;

/** The catalog last synced from the backend, or the copy bundled with the app. */
export function getCatalog(): CompiledCatalog {
  if (compiled) return compiled;
  try {
    if (existsSync(syncedPath())) {
      const synced = JSON.parse(readFileSync(syncedPath(), 'utf-8'));
      if (Array.isArray(synced.tools) && synced.tools.length > 0) {
        compiled = compileCatalog(synced.tools, synced.catalogVersion || 0);
        return compiled;
      }
    }
  } catch (err: any) {
    logger.warn('Ignoring unreadable synced catalog:', err.message);
  }
  compiled = compileCatalog(bundled.tools as CatalogTool[], bundled.catalogVersion);
  return compiled;
}

export function saveSyncedCatalog(tools: CatalogTool[]): void {
  writeFileSync(syncedPath(), JSON.stringify({ catalogVersion: bundled.catalogVersion, syncedAt: new Date().toISOString(), tools }), 'utf-8');
  compiled = compileCatalog(tools, bundled.catalogVersion);
  rulesWritten = false;
}

/** Path of the deep-scan rules file for the current catalog (rewritten after each sync). */
export function getScannerRulesFile(): string {
  if (!rulesWritten) {
    writeFileSync(rulesPath(), scannerRules(getCatalog()), 'utf-8');
    rulesWritten = true;
  }
  return rulesPath();
}
