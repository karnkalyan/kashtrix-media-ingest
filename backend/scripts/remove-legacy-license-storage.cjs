const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function removeLegacyLicenseStorage() {
  // These are the only records used by the removed local JWT generator/HWID
  // system. Operational settings, users, channels and media rows are untouched.
  try {
    await prisma.$executeRawUnsafe("DELETE FROM `KvStore` WHERE `key` IN ('license', 'system_hwid')");
  } catch (error) {
    // A brand-new database has no KvStore until the following Prisma push.
    if (!String(error?.message || '').includes("doesn't exist") && error?.meta?.code !== '1146') throw error;
  }
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS `GeneratedLicense`');
  console.log('Removed obsolete local license keys and generator storage.');
}

removeLegacyLicenseStorage()
  .finally(async () => prisma.$disconnect())
  .catch(error => {
    console.error('Legacy license cleanup failed:', error.message || error);
    process.exit(1);
  });
