import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { emitPendingTool } from './socket';
import { isBlacklistedSystemProcess } from '../utils/systemBlacklist';

/**
 * Auto-tracking of AI tools that are not in the catalog yet.
 *
 * A client may only *suggest* a new tool; it becomes a PENDING entry for an
 * admin to approve, and usage is recorded only once it is approved. A
 * suggestion is accepted only with real evidence that it is an AI product:
 *   WEB  a domain ending in ".ai" (or a host containing gpt/llm) that actually
 *        appears in the reported title or URL
 *   APP  an executable with a word starting or ending in "gpt" or "llm"
 * Merely containing the word "AI" (e.g. "SVKM's NMIMS · AI Integrity
 * Monitor", "AI explained - YouTube") is never enough.
 */

export interface CandidateInput {
  pattern?: string;
  name?: string;
  type?: string;
  rawIdentifier?: string;
}

export interface Candidate {
  pattern: string;
  name: string;
  type: 'WEB' | 'APP';
}

/** This product's own windows, sites and processes. */
const OWN_PRODUCT = /ai integrity monitor|tooldetect\.in|ai[-\s]?tool[-\s]?detector|ai[-\s]?monitor|tabscanner/i;

export function isOwnProduct(...texts: (string | undefined)[]): boolean {
  return texts.some(t => !!t && OWN_PRODUCT.test(t));
}

const AI_DOMAIN = /(?:^|[^a-z0-9.-])((?:[a-z0-9-]+\.)*[a-z0-9-]{2,}\.ai)(?![a-z0-9-])/i;
const AI_HOST = /(?:^|[^a-z0-9.-])((?:[a-z0-9-]+\.)*(?:[a-z0-9-]*gpt[a-z0-9-]*|[a-z0-9-]*llm[a-z0-9-]*)\.(?:[a-z0-9-]+\.)*[a-z]{2,})(?![a-z0-9-])/i;

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Returns a normalized candidate when the evidence holds up, otherwise null. */
export function plausibleCandidate(input: CandidateInput): Candidate | null {
  const evidence = `${input.pattern || ''} ${input.rawIdentifier || ''}`;
  if (isOwnProduct(evidence, input.name)) return null;
  if (isBlacklistedSystemProcess(input.pattern) || isBlacklistedSystemProcess(input.rawIdentifier)) return null;

  if (input.type === 'APP') {
    const exe = (input.pattern || '').trim().toLowerCase().replace(/\.exe$/, '');
    const words = exe.split(/[^a-z0-9]+/).filter(Boolean);
    if (!exe || !words.some(w => /^(gpt|llm)|(gpt|llm)$/.test(w))) return null;
    return { pattern: `${exe}.exe`, name: input.name?.trim() || titleCase(exe), type: 'APP' };
  }

  // WEB: the domain must be observed in the reported title/URL, not invented by the client.
  const observed = (input.rawIdentifier || '').toLowerCase();
  const domain = (AI_DOMAIN.exec(observed) || AI_HOST.exec(observed))?.[1]?.replace(/^www\./, '');
  if (!domain || isOwnProduct(domain)) return null;
  const base = domain.replace(/\.(ai|[a-z]{2,})$/, '').split('.').pop() || domain;
  return { pattern: domain, name: `${titleCase(base)} AI`, type: 'WEB' };
}

export type CandidateOutcome = 'rejected' | 'known' | 'pending' | 'created' | 'disabled';

/** Adds or re-reports a PENDING tool for admin review. Never records usage. */
export async function recordCandidate(input: CandidateInput): Promise<{ outcome: CandidateOutcome; tool?: unknown }> {
  const candidate = plausibleCandidate(input);
  if (!candidate) return { outcome: 'rejected' };

  const existing = await prisma.aIToolSignature.findFirst({ where: { pattern: candidate.pattern } });
  if (existing) {
    if (existing.status === 'BUILT_IN' || existing.status === 'APPROVED') return { outcome: 'known', tool: existing };
    if (existing.status === 'REJECTED') return { outcome: 'rejected' };
    const updated = await prisma.aIToolSignature.update({ where: { id: existing.id }, data: { reportCount: { increment: 1 } } });
    emitPendingTool({
      toolId: updated.id, suggestedName: updated.name, pattern: updated.pattern,
      reportCount: updated.reportCount, firstDetectedAt: updated.createdAt.toISOString(),
    });
    return { outcome: 'pending', tool: updated };
  }

  const autoFlag = await prisma.appSetting.findUnique({ where: { key: 'auto_flag_unknown_tools' } });
  if (autoFlag?.value === 'false') return { outcome: 'disabled' };

  const tool = await prisma.aIToolSignature.create({
    data: {
      name: candidate.name,
      type: candidate.type,
      pattern: candidate.pattern,
      keywords: [candidate.name],
      status: 'PENDING',
      addedBy: 'auto_detected',
      reportCount: 1,
      description: input.rawIdentifier ? `Auto-detected from: ${input.rawIdentifier.slice(0, 200)}` : undefined,
    },
  });
  emitPendingTool({
    toolId: tool.id, suggestedName: tool.name, pattern: tool.pattern,
    reportCount: tool.reportCount, firstDetectedAt: tool.createdAt.toISOString(),
  });
  logger.info(`New AI tool awaiting admin review: ${tool.name} (${tool.pattern})`);
  return { outcome: 'created', tool };
}
