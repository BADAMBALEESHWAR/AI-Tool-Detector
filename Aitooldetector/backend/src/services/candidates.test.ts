jest.mock('../utils/prisma', () => ({ prisma: {} }));
jest.mock('./socket', () => ({ emitPendingTool: jest.fn() }));

import { isOwnProduct, plausibleCandidate } from './candidates';

describe('plausibleCandidate — what may enter the admin review queue', () => {
  it.each([
    // Exactly what desktop v1 sent from production (pattern invented from the title).
    { name: "SVKM's NMIMS AI", pattern: "svkm'snmims.ai", type: 'WEB', rawIdentifier: "SVKM's NMIMS · AI Integrity Monitor — Student Portal - Google Chrome [Auto-Discovered]" },
    { name: "SVKM's NMIMS AI", pattern: 'svkmsnmims.ai', type: 'WEB', rawIdentifier: "SVKM's NMIMS · AI Integrity Monitor — Admin - Brave [Auto-Discovered]" },
    // Pages that only talk about AI.
    { name: 'AI explained', type: 'WEB', rawIdentifier: 'AI explained in 10 minutes - YouTube' },
    { name: 'Agents AI', type: 'WEB', rawIdentifier: 'Top 10 AI agents for students - Medium' },
    { name: 'Chat', type: 'WEB', rawIdentifier: 'WhatsApp - chat.whatsapp.com' },
    // This product itself.
    { name: 'Tooldetect AI', type: 'WEB', rawIdentifier: 'Portal - student-dashboard.tooldetect.in' },
    // Ordinary or system executables.
    { name: 'OmenInstallMonitor', pattern: 'OmenInstallMonitor.exe', type: 'APP' },
    { name: 'AI Monitor', pattern: 'AI Monitor.exe', type: 'APP' },
    { name: 'Notepad', pattern: 'notepad.exe', type: 'APP' },
  ])('rejects $rawIdentifier$pattern', input => {
    expect(plausibleCandidate(input)).toBeNull();
  });

  it('accepts a real .ai domain that appears in the title, ignoring the client-invented pattern', () => {
    expect(plausibleCandidate({ name: 'x', pattern: 'made-up.ai', type: 'WEB', rawIdentifier: 'Welcome to StudyBuddy.ai - homework help' }))
      .toEqual({ pattern: 'studybuddy.ai', name: 'Studybuddy AI', type: 'WEB' });
  });

  it('accepts a gpt/llm host seen in a URL', () => {
    expect(plausibleCandidate({ type: 'WEB', rawIdentifier: 'https://www.essaygpt.net/write' }))
      .toEqual({ pattern: 'essaygpt.net', name: 'Essaygpt AI', type: 'WEB' });
  });

  it('accepts executables named like local LLM apps', () => {
    expect(plausibleCandidate({ pattern: 'mygpt-runner.exe', type: 'APP' })).toEqual({ pattern: 'mygpt-runner.exe', name: 'Mygpt-runner', type: 'APP' });
    expect(plausibleCandidate({ pattern: 'LocalLLM', name: 'Local LLM', type: 'APP' })).toEqual({ pattern: 'localllm.exe', name: 'Local LLM', type: 'APP' });
  });
});

describe('isOwnProduct', () => {
  it.each(["SVKM's NMIMS · AI Integrity Monitor — Student Portal", 'api.tooldetect.in', 'AI Monitor.exe', 'TabScanner'])('%s', text => {
    expect(isOwnProduct(text)).toBe(true);
  });

  it('does not match other products', () => {
    expect(isOwnProduct('ChatGPT', 'perplexity.ai')).toBe(false);
  });
});
