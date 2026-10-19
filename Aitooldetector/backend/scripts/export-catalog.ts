/**
 * Writes the built-in catalog into the desktop app's bundled offline copy
 * (desktop-app/src/data/ai-tools.json). Run after editing aiToolsPreset.ts:
 *   npm run catalog:export
 * The backend test suite fails if the two drift apart.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { buildDesktopCatalog } from '../src/utils/desktopCatalog';

const target = join(__dirname, '..', '..', 'desktop-app', 'src', 'data', 'ai-tools.json');
writeFileSync(target, JSON.stringify(buildDesktopCatalog(), null, 2) + '\n', 'utf-8');
console.log(`Wrote ${target}`);
