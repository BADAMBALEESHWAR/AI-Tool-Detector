import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { BUILTIN_AI_TOOLS } from '../src/utils/aiToolsPreset';

const prisma = new PrismaClient();

const DEFAULT_SETTINGS = [
  { key: 'monitoring_enabled', value: 'true' },
  { key: 'auto_track_ai_tools', value: 'true' },
  { key: 'auto_flag_unknown_tools', value: 'true' },
  { key: 'auto_approve_flagged_tools', value: 'false' },
  { key: 'instant_detection_enabled', value: 'true' },
  { key: 'monitoring_hours_start', value: '08:00' },
  { key: 'monitoring_hours_end', value: '20:00' },
  { key: 'monitoring_all_hours', value: 'true' },
  { key: 'session_dedup_minutes', value: '5' },
  { key: 'heartbeat_interval_seconds', value: '60' },
  { key: 'tool_sync_interval_minutes', value: '5' },
];

async function main() {
  console.log('🌱 Seeding database...');

  // Seed AI tools
  console.log(`  → Seeding ${BUILTIN_AI_TOOLS.length} built-in AI tool signatures...`);
  for (const tool of BUILTIN_AI_TOOLS) {
    const existing = await prisma.aIToolSignature.findFirst({
      where: { pattern: tool.pattern },
    });

    if (existing) {
      await prisma.aIToolSignature.update({
        where: { id: existing.id },
        data: {
          name: tool.name,
          type: tool.type,
          aliases: tool.aliases,
          keywords: tool.keywords,
          description: tool.description,
          status: 'BUILT_IN',
          addedBy: 'system',
        },
      });
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
        },
      });
    }
  }
  console.log(`  ✅ AI tools seeded.`);

  // Seed default settings
  console.log(`  → Seeding default app settings...`);
  for (const setting of DEFAULT_SETTINGS) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: { key: setting.key, value: setting.value },
    });
  }
  console.log(`  ✅ Settings seeded.`);

  // Seed default admin user
  const adminExists = await prisma.adminUser.findFirst({
    where: { email: 'admin@institution.edu' },
  });
  if (!adminExists) {
    const passwordHash = await bcrypt.hash('Admin@123', 12);
    await prisma.adminUser.create({
      data: {
        name: 'System Admin',
        email: 'admin@institution.edu',
        passwordHash,
        role: 'superadmin',
      },
    });
    console.log(`  ✅ Default admin created: admin@institution.edu / Admin@123`);
    console.log(`  ⚠️  CHANGE THE DEFAULT ADMIN PASSWORD AFTER FIRST LOGIN!`);
  } else {
    console.log(`  ℹ️  Admin already exists, skipping.`);
  }

  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
