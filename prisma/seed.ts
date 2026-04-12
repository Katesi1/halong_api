import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Integer constants matching src/common/constants.ts
const ROLE = { ADMIN: 0, OWNER: 1, SALE: 2, CUSTOMER: 3 };

async function main() {
  console.log('🌱 Seeding database...');

  // Reset all data
  await prisma.partnerKey.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.calendarLock.deleteMany();
  await prisma.propertyImage.deleteMany();
  await prisma.property.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.user.deleteMany();

  const commonPassword = await bcrypt.hash('Abcd@1234', 10);

  // 1. Users
  await prisma.user.create({
    data: { name: 'Super Admin', email: 'admin@halong24h.com', password: commonPassword, role: ROLE.ADMIN },
  });

  await prisma.user.create({
    data: { name: 'Owner Test', email: 'owner@halong24h.com', password: commonPassword, role: ROLE.OWNER },
  });

  await prisma.user.create({
    data: { name: 'Staff Test', email: 'staff@halong24h.com', password: commonPassword, role: ROLE.SALE },
  });

  await prisma.user.create({
    data: { name: 'Customer Test', email: 'customer@halong24h.com', password: commonPassword, role: ROLE.CUSTOMER },
  });

  console.log('✅ Users seeded (4 accounts):');
  console.log('   ADMIN    — email: admin@halong24h.com / password: Abcd@1234');
  console.log('   OWNER    — email: owner@halong24h.com / password: Abcd@1234');
  console.log('   SALE     — email: staff@halong24h.com / password: Abcd@1234');
  console.log('   CUSTOMER — email: customer@halong24h.com / password: Abcd@1234');

  // 2. PartnerKeys
  await Promise.all([
    prisma.partnerKey.create({ data: { partnerName: 'Agoda', apiKey: 'KEY-AGODA-123', rateLimit: 100 } }),
    prisma.partnerKey.create({ data: { partnerName: 'Booking.com', apiKey: 'KEY-BOOKING-123', rateLimit: 150 } }),
    prisma.partnerKey.create({ data: { partnerName: 'Traveloka', apiKey: 'KEY-TRAVELOKA-123', rateLimit: 200 } }),
    prisma.partnerKey.create({ data: { partnerName: 'Trip.com', apiKey: 'KEY-TRIP-123', rateLimit: 50 } }),
    prisma.partnerKey.create({ data: { partnerName: 'Airbnb', apiKey: 'KEY-AIRBNB-123', rateLimit: 300 } }),
  ]);
  console.log('✅ PartnerKeys seeded (5 records)');

  console.log('');
  console.log('📌 Properties & Bookings: trống — Admin/Owner tự tạo trên app');
  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
