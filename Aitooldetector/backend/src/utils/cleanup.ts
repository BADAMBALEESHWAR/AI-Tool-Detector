import { PrismaClient } from '@prisma/client';
import { isBlacklistedSystemProcess } from './systemBlacklist';

const prisma = new PrismaClient();

async function clean() {
  console.log('Cleaning non-AI false positive records from database...');

  // Fetch all signatures to check with blacklist
  const allTools = await prisma.aIToolSignature.findMany();
  const invalidToolIds = allTools
    .filter(t => isBlacklistedSystemProcess(t.pattern) || isBlacklistedSystemProcess(t.name) || (t.pattern === 'google.com' && t.name !== 'Google Gemini'))
    .map(t => t.id);

  let deletedToolsCount = 0;
  if (invalidToolIds.length > 0) {
    const res = await prisma.aIToolSignature.deleteMany({
      where: { id: { in: invalidToolIds } },
    });
    deletedToolsCount = res.count;
  }

  // Fetch all recent usage events to check with blacklist
  const allEvents = await prisma.usageEvent.findMany({
    select: { id: true, toolName: true, rawIdentifier: true },
  });

  const invalidEventIds = allEvents
    .filter(e => isBlacklistedSystemProcess(e.toolName) || isBlacklistedSystemProcess(e.rawIdentifier))
    .map(e => e.id);

  let deletedEventsCount = 0;
  if (invalidEventIds.length > 0) {
    const res = await prisma.usageEvent.deleteMany({
      where: { id: { in: invalidEventIds } },
    });
    deletedEventsCount = res.count;
  }

  console.log(`Deleted ${deletedEventsCount} invalid usage events and ${deletedToolsCount} invalid tool signatures.`);
}

clean()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
