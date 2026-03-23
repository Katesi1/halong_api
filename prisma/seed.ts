import { PrismaClient, BookingStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Use string literals since Prisma Client may not have STAFF/CUSTOMER yet
const RoleStaff = 'STAFF' as any;
const RoleCustomer = 'CUSTOMER' as any;
const RoleAdmin = 'ADMIN' as any;

async function main() {
  console.log('🌱 Seeding database...');

  // Reset existing data to avoid duplication logic complexity
  await prisma.partnerKey.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.roomPrice.deleteMany();
  await prisma.roomImage.deleteMany();
  await prisma.room.deleteMany();
  await prisma.homestay.deleteMany();

  const commonPassword = await bcrypt.hash('Abcd@1234', 10);
  const adminPhone = process.env.ADMIN_PHONE || 'Admin';

  // Xoá user test cũ nếu tồn tại (tránh conflict phone/email)
  await prisma.user.deleteMany({
    where: {
      AND: [
        { phone: { not: adminPhone } },
        { role: { not: RoleAdmin } },
      ],
    },
  });

  // 1. Admin — giữ nguyên nếu đã có, tạo mới nếu chưa
  const admin = await prisma.user.upsert({
    where: { phone: adminPhone },
    update: { role: RoleAdmin },
    create: { name: 'Super Admin', phone: adminPhone, password: commonPassword, role: RoleAdmin },
  });

  // 2. Staff test account — stafftest@gmail.com / Abcd@1234
  const staffTest = await prisma.user.create({
    data: {
      name: 'Staff Test',
      phone: '0900000001',
      email: 'stafftest@gmail.com',
      password: commonPassword,
      role: RoleStaff,
    },
  });

  // 3. Customer test account — usertest@gmail.com / Abcd@1234
  const customerTest = await prisma.user.create({
    data: {
      name: 'User Test',
      phone: '0900000002',
      email: 'usertest@gmail.com',
      password: commonPassword,
      role: RoleCustomer,
    },
  });

  const staffUsers = [staffTest];
  const customers = [customerTest];

  console.log('✅ Users seeded (3 accounts):');
  console.log('   ADMIN    — phone: ' + adminPhone + ' / password: Abcd@1234');
  console.log('   STAFF    — email: stafftest@gmail.com / password: Abcd@1234');
  console.log('   CUSTOMER — email: usertest@gmail.com / password: Abcd@1234');

  // 2. Homestays (5 records)
  const homestays = await Promise.all([
    prisma.homestay.create({ data: { ownerId: staffUsers[0].id, name: 'Halong Bay Resort', address: 'Bãi Cháy, Hạ Long', latitude: 20.9545, longitude: 107.0509 } }),
    prisma.homestay.create({ data: { ownerId: staffUsers[0].id, name: 'Sunshine House', address: '45 Sun Rd, Vung Tau' } }),
    prisma.homestay.create({ data: { ownerId: staffUsers[0].id, name: 'Ocean Villa', address: '88 Beachside, Nha Trang' } }),
    prisma.homestay.create({ data: { ownerId: staffUsers[0].id, name: 'Mountain Retreat', address: '12 Pine Hill, Sapa' } }),
    prisma.homestay.create({ data: { ownerId: staffUsers[0].id, name: 'City Center Condo', address: '99 District 1, HCMC' } }),
  ]);
  console.log('✅ Homestays seeded (5 records)');

  // 3. Rooms (5 records - 1 per homestay)
  const rooms = await Promise.all(homestays.map((hs, i) =>
    prisma.room.create({
      data: {
        homestayId: hs.id,
        name: `Room Type ${i + 1}`,
        code: `P.${(i + 1) * 101}`,
        bedrooms: Math.ceil((i + 1) / 2),
        maxGuests: 2 + i,
        description: `Beautiful room in ${hs.name}`,
      }
    })
  ));
  console.log('✅ Rooms seeded (5 records)');

  // 4. RoomImages (5 records - 1 per room)
  await Promise.all(rooms.map((r, i) =>
    prisma.roomImage.create({
      data: {
        roomId: r.id,
        imageUrl: `https://picsum.photos/seed/room${i}/800/600`,
        publicId: `dummy/room${i}`,
        isCover: true,
      }
    })
  ));
  console.log('✅ RoomImages seeded (5 records)');

  // 5. RoomPrices (5 records - 1 per room)
  await Promise.all(rooms.map((r, i) =>
    prisma.roomPrice.create({
      data: {
        roomId: r.id,
        weekdayPrice: 500000 + i * 100000,
        fridayPrice: 600000 + i * 100000,
        saturdayPrice: 800000 + i * 100000,
        holidayPrice: 1000000 + i * 100000,
      }
    })
  ));
  console.log('✅ RoomPrices seeded (5 records)');

  // 6. Bookings (5 records: mix of staff-created and customer-created)
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const nextWeek = new Date(now); nextWeek.setDate(now.getDate() + 7);
  const twoWeeks = new Date(now); twoWeeks.setDate(now.getDate() + 14);

  await Promise.all([
    // Staff-created bookings (saleId set)
    prisma.booking.create({ data: { roomId: rooms[0].id, saleId: staffUsers[0].id, checkinDate: tomorrow, checkoutDate: nextWeek, status: BookingStatus.CONFIRMED, customerName: 'Khách Walk-in 1', customerPhone: '0911111111', depositAmount: 500000 } }),
    prisma.booking.create({ data: { roomId: rooms[1].id, saleId: staffUsers[0].id, checkinDate: tomorrow, checkoutDate: nextWeek, status: BookingStatus.HOLD, holdExpireAt: new Date(now.getTime() + 1800000), customerName: 'Khách Walk-in 2', customerPhone: '0922222222' } }),
    prisma.booking.create({ data: { roomId: rooms[2].id, saleId: staffUsers[0].id, checkinDate: tomorrow, checkoutDate: nextWeek, status: BookingStatus.CANCELLED, customerName: 'Khách Walk-in 3' } }),
    // Customer-created bookings (customerId set)
    prisma.booking.create({ data: { roomId: rooms[3].id, customerId: customers[0].id, checkinDate: nextWeek, checkoutDate: twoWeeks, status: BookingStatus.HOLD, holdExpireAt: new Date(now.getTime() + 86400000), customerName: customers[0].name, customerPhone: customers[0].phone, guestCount: 3 } }),
    prisma.booking.create({ data: { roomId: rooms[4].id, customerId: customers[0].id, checkinDate: nextWeek, checkoutDate: twoWeeks, status: BookingStatus.CONFIRMED, customerName: customers[0].name, customerPhone: customers[0].phone, guestCount: 2 } }),
  ]);
  console.log('✅ Bookings seeded (5 records: 3 staff, 2 customer)');

  // 7. PartnerKeys (5 records)
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
