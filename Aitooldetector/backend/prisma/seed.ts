import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { upgradeBuiltinCatalogIfNeeded } from '../src/utils/catalogSync';

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

  // Seed the built-in AI tool catalog (same code path the server uses on start-up)
  const catalog = await upgradeBuiltinCatalogIfNeeded(prisma);
  console.log(catalog ? `  ✅ AI catalog seeded (${catalog.upserted} tools).` : '  ℹ️  AI catalog already up to date.');

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
