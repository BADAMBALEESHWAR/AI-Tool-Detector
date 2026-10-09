import { BUILTIN_AI_TOOLS } from './aiToolsPreset';
import { prisma } from './prisma';

async function main() {
  console.log(`Updating DB with ${BUILTIN_AI_TOOLS.length} preset tools...`);
  for (const tool of BUILTIN_AI_TOOLS) {
    const existing = await prisma.aIToolSignature.findFirst({
      where: {
        OR: [
          { pattern: tool.pattern },
          { name: tool.name }
        ]
      }
    });

    if (existing) {
      await prisma.aIToolSignature.update({
        where: { id: existing.id },
        data: {
          name: tool.name,
          type: tool.type,
          pattern: tool.pattern,
          aliases: tool.aliases,
          keywords: tool.keywords,
          description: tool.description,
          status: existing.status === 'REJECTED' ? 'REJECTED' : 'BUILT_IN',
        }
      });
      console.log(`Updated: ${tool.name}`);
    } else {
      await prisma.aIToolSignature.create({
        data: {
          name: tool.name,
          type: tool.type,
          pattern: tool.pattern,
          aliases: tool.aliases,
          keywords: tool.keywords,
          description: tool.description,
          status: 'BUILT_IN',
          addedBy: 'system',
        }
      });
      console.log(`Created: ${tool.name}`);
    }
  }

  const total = await prisma.aIToolSignature.count();
  console.log(`Total tools in database: ${total}`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
