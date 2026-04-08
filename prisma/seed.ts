import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Integer constants matching src/common/constants.ts
const ROLE = { ADMIN: 0, STAFF: 1, CUSTOMER: 2 };
const BOOKING_STATUS = { HOLD: 0, CONFIRMED: 1, CANCELLED: 2, COMPLETED: 3 };

async function main() {
  console.log('🌱 Seeding database...');

  // Reset existing data
  await prisma.partnerKey.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.calendarLock.deleteMany();
  await prisma.propertyImage.deleteMany();
  await prisma.property.deleteMany();

  const commonPassword = await bcrypt.hash('Abcd@1234', 10);
  const adminPhone = process.env.ADMIN_PHONE || 'Admin';

  // Delete non-admin test users
  await prisma.user.deleteMany({
    where: {
      AND: [
        { phone: { not: adminPhone } },
        { role: { not: ROLE.ADMIN } },
      ],
    },
  });

  // 1. Users
  const admin = await prisma.user.upsert({
    where: { phone: adminPhone },
    update: { role: ROLE.ADMIN },
    create: { name: 'Super Admin', phone: adminPhone, password: commonPassword, role: ROLE.ADMIN },
  });

  const staffTest = await prisma.user.create({
    data: {
      name: 'Staff Test',
      phone: '0900000001',
      email: 'stafftest@gmail.com',
      password: commonPassword,
      role: ROLE.STAFF,
    },
  });

  const customerTest = await prisma.user.create({
    data: {
      name: 'User Test',
      phone: '0900000002',
      email: 'usertest@gmail.com',
      password: commonPassword,
      role: ROLE.CUSTOMER,
    },
  });

  console.log('✅ Users seeded (3 accounts):');
  console.log('   ADMIN    — phone: ' + adminPhone + ' / password: Abcd@1234');
  console.log('   STAFF    — email: stafftest@gmail.com / password: Abcd@1234');
  console.log('   CUSTOMER — email: usertest@gmail.com / password: Abcd@1234');

  // 2. Properties (5 records)
  const properties = await Promise.all([
    prisma.property.create({ data: { ownerId: staffTest.id, name: 'Halong Bay Resort', code: 'HLR01', type: 0, address: 'Bãi Cháy, Hạ Long', latitude: 20.9545, longitude: 107.0509, bedrooms: 3, bathrooms: 2, standardGuests: 4, maxGuests: 6, weekdayPrice: 1500000, weekendPrice: 2000000, holidayPrice: 2500000 } }),
    prisma.property.create({ data: { ownerId: staffTest.id, name: 'Sunshine House', code: 'SSH01', type: 1, address: '45 Sun Rd, Vung Tau', bedrooms: 2, bathrooms: 1, standardGuests: 2, maxGuests: 4, weekdayPrice: 800000, weekendPrice: 1200000, holidayPrice: 1500000 } }),
    prisma.property.create({ data: { ownerId: staffTest.id, name: 'Ocean Villa', code: 'OCV01', type: 0, address: '88 Beachside, Nha Trang', bedrooms: 4, bathrooms: 3, standardGuests: 6, maxGuests: 8, weekdayPrice: 2500000, weekendPrice: 3500000, holidayPrice: 4500000 } }),
    prisma.property.create({ data: { ownerId: staffTest.id, name: 'Mountain Retreat', code: 'MTR01', type: 1, address: '12 Pine Hill, Sapa', bedrooms: 2, bathrooms: 1, standardGuests: 2, maxGuests: 3, weekdayPrice: 600000, weekendPrice: 900000, holidayPrice: 1200000 } }),
    prisma.property.create({ data: { ownerId: staffTest.id, name: 'City Center Condo', code: 'CCC01', type: 2, address: '99 District 1, HCMC', bedrooms: 1, bathrooms: 1, standardGuests: 2, maxGuests: 2, weekdayPrice: 500000, weekendPrice: 700000, holidayPrice: 900000 } }),
  ]);
  console.log('✅ Properties seeded (5 records)');

  // 3. PropertyImages (5 records - 1 cover per property)
  await Promise.all(properties.map((p, i) =>
    prisma.propertyImage.create({
      data: {
        propertyId: p.id,
        imageUrl: `https://picsum.photos/seed/prop${i}/800/600`,
        publicId: `dummy/prop${i}`,
        isCover: true,
      },
    })
  ));
  console.log('✅ PropertyImages seeded (5 records)');

  // 4. Bookings (5 records: mix of staff-created and customer-created)
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const nextWeek = new Date(now); nextWeek.setDate(now.getDate() + 7);
  const twoWeeks = new Date(now); twoWeeks.setDate(now.getDate() + 14);

  await Promise.all([
    prisma.booking.create({ data: { propertyId: properties[0].id, saleId: staffTest.id, checkinDate: tomorrow, checkoutDate: nextWeek, status: BOOKING_STATUS.CONFIRMED, customerName: 'Khách Walk-in 1', customerPhone: '0911111111', depositAmount: 500000 } }),
    prisma.booking.create({ data: { propertyId: properties[1].id, saleId: staffTest.id, checkinDate: tomorrow, checkoutDate: nextWeek, status: BOOKING_STATUS.HOLD, holdExpireAt: new Date(now.getTime() + 1800000), customerName: 'Khách Walk-in 2', customerPhone: '0922222222' } }),
    prisma.booking.create({ data: { propertyId: properties[2].id, saleId: staffTest.id, checkinDate: tomorrow, checkoutDate: nextWeek, status: BOOKING_STATUS.CANCELLED, customerName: 'Khách Walk-in 3' } }),
    prisma.booking.create({ data: { propertyId: properties[3].id, customerId: customerTest.id, checkinDate: nextWeek, checkoutDate: twoWeeks, status: BOOKING_STATUS.HOLD, holdExpireAt: new Date(now.getTime() + 86400000), customerName: customerTest.name, customerPhone: customerTest.phone, guestCount: 3 } }),
    prisma.booking.create({ data: { propertyId: properties[4].id, customerId: customerTest.id, checkinDate: nextWeek, checkoutDate: twoWeeks, status: BOOKING_STATUS.CONFIRMED, customerName: customerTest.name, customerPhone: customerTest.phone, guestCount: 2 } }),
  ]);
  console.log('✅ Bookings seeded (5 records: 3 staff, 2 customer)');

  // 5. PartnerKeys (5 records)
  await Promise.all([
    prisma.partnerKey.create({ data: { partnerName: 'Agoda', apiKey: 'KEY-AGODA-123', rateLimit: 100 } }),
    prisma.partnerKey.create({ data: { partnerName: 'Booking.com', apiKey: 'KEY-BOOKING-123', rateLimit: 150 } }),
    prisma.partnerKey.create({ data: { partnerName: 'Traveloka', apiKey: 'KEY-TRAVELOKA-123', rateLimit: 200 } }),
    prisma.partnerKey.create({ data: { partnerName: 'Trip.com', apiKey: 'KEY-TRIP-123', rateLimit: 50 } }),
    prisma.partnerKey.create({ data: { partnerName: 'Airbnb', apiKey: 'KEY-AIRBNB-123', rateLimit: 300 } }),
  ]);
  console.log('✅ PartnerKeys seeded (5 records)');

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
