import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Integer constants — keep in sync with src/common/constants.ts
const ROLE = { ADMIN: 0, OWNER: 1, SALE: 2, CUSTOMER: 3 };
const PROPERTY_TYPE = { VILLA: 0, HOMESTAY: 1, HOTEL: 2 };
const CANCELLATION_POLICY = { FLEXIBLE: 0, MODERATE: 1, STRICT: 2 };
const BOOKING_STATUS = { HOLD: 0, CONFIRMED: 1, CANCELLED: 2, COMPLETED: 3 };
const NOTIFICATION_TYPE = { BOOKING: 0, PAYMENT: 1, SYSTEM: 2 };
const CALENDAR_LOCK_STATUS = { LOCKED: 0, HOLD: 1, BOOKED: 2 };

const daysFromNow = (d: number) => {
  const date = new Date();
  date.setDate(date.getDate() + d);
  date.setHours(14, 0, 0, 0);
  return date;
};

const hoursAgo = (h: number) => {
  const date = new Date();
  date.setHours(date.getHours() - h);
  return date;
};

const datesBetween = (start: Date, end: Date): Date[] => {
  const out: Date[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const stop = new Date(end);
  stop.setHours(0, 0, 0, 0);
  while (cur < stop) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
};

async function main() {
  console.log('🌱 Seeding database (full reset)...');

  // ─── Reset (order matters: leaf tables first) ────────────────────────────
  await prisma.propertyReview.deleteMany();
  await prisma.calendarLock.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.propertyImage.deleteMany();
  await prisma.property.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.userDevice.deleteMany();
  await prisma.staffInvite.deleteMany();
  await prisma.userPermission.deleteMany();
  await prisma.paymentSession.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.kycUpload.deleteMany();
  await prisma.kycSubmission.deleteMany();
  await prisma.user.deleteMany();
  await prisma.billingPlan.deleteMany();
  await prisma.partnerKey.deleteMany();
  await prisma.appVersion.deleteMany();
  console.log('✅ Reset done');

  // ─── 1. BillingPlans (cần cho subscription của OWNER demo) ───────────────
  await prisma.billingPlan.createMany({
    data: [
      {
        id: 'starter',
        name: 'Starter',
        pricePerRoom: 99000,
        minCharge: 199000,
        maxRooms: 5,
        yearlyDiscountPct: 20,
        vatPct: 10,
        features: ['Quản lý 1-5 phòng', 'Lịch booking', 'Báo cáo cơ bản'],
        active: true,
        sortOrder: 0,
      },
      {
        id: 'professional',
        name: 'Professional',
        pricePerRoom: 79000,
        minCharge: 499000,
        maxRooms: 20,
        yearlyDiscountPct: 20,
        vatPct: 10,
        features: ['Quản lý 6-20 phòng', 'Multi-staff', 'API partner', 'Báo cáo nâng cao'],
        active: true,
        sortOrder: 1,
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        pricePerRoom: 59000,
        minCharge: 1499000,
        maxRooms: null,
        yearlyDiscountPct: 25,
        vatPct: 10,
        features: ['Không giới hạn phòng', 'Priority support', 'Custom integration'],
        active: true,
        sortOrder: 2,
      },
    ],
  });
  console.log('✅ BillingPlans seeded (3 plans)');

  // ─── 2. Users ────────────────────────────────────────────────────────────
  const myPassword = await bcrypt.hash('Abcd@1234', 10);
  const reviewPassword = await bcrypt.hash('Halong24h@2026', 10);

  // 2a. Personal admin
  const myAdmin = await prisma.user.create({
    data: {
      name: 'Super Admin',
      email: 'admin@halong24h.com',
      password: myPassword,
      role: ROLE.ADMIN,
      emailVerified: true,
      isActive: true,
    },
  });

  // 2b. Apple Review CUSTOMER
  const reviewCustomer = await prisma.user.create({
    data: {
      name: 'Apple Reviewer Customer',
      email: 'apple-review-customer@halong24h.com',
      phone: '0327000001',
      password: reviewPassword,
      role: ROLE.CUSTOMER,
      emailVerified: true,
      isActive: true,
    },
  });

  // 2c. Apple Review OWNER (KYC approved, trial 30d)
  const trialEndsAt = daysFromNow(30);
  const reviewOwner = await prisma.user.create({
    data: {
      name: 'Apple Reviewer Owner',
      email: 'apple-review-owner@halong24h.com',
      phone: '0327000002',
      password: reviewPassword,
      role: ROLE.OWNER,
      emailVerified: true,
      isActive: true,
      kycBypass: true,
      kycStatus: 'approved',
      subscriptionStatus: 'trial',
      subscriptionPlanId: 'starter',
      subscriptionCycle: 'monthly',
      trialEndsAt,
      nextChargeAt: trialEndsAt,
    },
  });

  // 2d. Apple Review SALE (linked to OWNER)
  const reviewSale = await prisma.user.create({
    data: {
      name: 'Apple Reviewer Sale',
      email: 'apple-review-sale@halong24h.com',
      phone: '0327000003',
      password: reviewPassword,
      role: ROLE.SALE,
      ownerId: reviewOwner.id,
      emailVerified: true,
      isActive: true,
    },
  });

  console.log('✅ Users seeded (4 accounts)');

  // ─── 3. KycSubmission cho OWNER (approved) ───────────────────────────────
  await prisma.kycSubmission.create({
    data: {
      userId: reviewOwner.id,
      status: 'approved',
      approvedAt: daysFromNow(-7),
      approvedById: myAdmin.id,
      trialEndsAt,
      chargeStartsAt: trialEndsAt,
      expectedRooms: 3,
      createdAt: daysFromNow(-8),
      updatedAt: daysFromNow(-7),
    },
  });

  // ─── 4. Subscription cho OWNER (trial) ───────────────────────────────────
  await prisma.subscription.create({
    data: {
      userId: reviewOwner.id,
      planId: 'starter',
      cycle: 'monthly',
      rooms: 3,
      status: 'trial',
      startsAt: new Date(),
      endsAt: trialEndsAt,
    },
  });

  console.log('✅ KYC + Subscription seeded for OWNER');

  // ─── 5. Properties (3 cho OWNER) ─────────────────────────────────────────
  const villa = await prisma.property.create({
    data: {
      ownerId: reviewOwner.id,
      name: 'Villa Hạ Long View Biển',
      code: 'VILLA-HALONG-001',
      type: PROPERTY_TYPE.VILLA,
      view: 'sea',
      address: 'Bãi Cháy, Hạ Long, Quảng Ninh',
      latitude: 20.9406,
      longitude: 107.0524,
      bedrooms: 3,
      bathrooms: 2,
      standardGuests: 6,
      maxGuests: 8,
      weekdayPrice: 3500000,
      weekendPrice: 4500000,
      holidayPrice: 5500000,
      adultSurcharge: 200000,
      childSurcharge: 100000,
      amenities: ['wifi', 'pool', 'parking', 'kitchen', 'tv', 'aircon'],
      cancellationPolicy: CANCELLATION_POLICY.MODERATE,
      checkInTime: '14:00',
      checkOutTime: '12:00',
      description: 'Villa cao cấp với view biển 180°, hồ bơi riêng, phù hợp gia đình 6-8 người.',
      isActive: true,
    },
  });

  const homestay = await prisma.property.create({
    data: {
      ownerId: reviewOwner.id,
      name: 'Homestay Bãi Cháy Cozy',
      code: 'HOMESTAY-BAICHAY-001',
      type: PROPERTY_TYPE.HOMESTAY,
      view: 'city',
      address: 'Bãi Cháy, Hạ Long, Quảng Ninh',
      latitude: 20.9512,
      longitude: 107.0641,
      bedrooms: 2,
      bathrooms: 1,
      standardGuests: 4,
      maxGuests: 4,
      weekdayPrice: 1200000,
      weekendPrice: 1500000,
      holidayPrice: 2000000,
      amenities: ['wifi', 'parking', 'kitchen', 'tv'],
      cancellationPolicy: CANCELLATION_POLICY.FLEXIBLE,
      checkInTime: '14:00',
      checkOutTime: '12:00',
      description: 'Homestay ấm cúng cho gia đình nhỏ, gần biển, nhà hàng sẵn ngay dưới phố.',
      isActive: true,
    },
  });

  const hotel = await prisma.property.create({
    data: {
      ownerId: reviewOwner.id,
      name: 'Hạ Long Bay Hotel - Studio',
      code: 'HOTEL-HALONG-001',
      type: PROPERTY_TYPE.HOTEL,
      view: 'sea',
      address: 'Hùng Thắng, Hạ Long, Quảng Ninh',
      latitude: 20.9583,
      longitude: 107.0716,
      bedrooms: 1,
      bathrooms: 1,
      standardGuests: 2,
      maxGuests: 3,
      weekdayPrice: 2000000,
      weekendPrice: 2500000,
      holidayPrice: 3000000,
      amenities: ['wifi', 'tv', 'aircon', 'minibar', 'breakfast'],
      cancellationPolicy: CANCELLATION_POLICY.STRICT,
      checkInTime: '14:00',
      checkOutTime: '12:00',
      description: 'Phòng studio sang trọng view vịnh Hạ Long, bao gồm bữa sáng.',
      isActive: true,
    },
  });

  console.log('✅ Properties seeded (3)');

  // ─── 6. Property Images (Unsplash placeholders) ──────────────────────────
  const villaImages = [
    'https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=1200',
    'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200',
    'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1200',
    'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=1200',
  ];
  const homestayImages = [
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200',
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200',
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200',
  ];
  const hotelImages = [
    'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200',
    'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=1200',
    'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1200',
  ];

  const seedImages = async (propertyId: string, urls: string[]) => {
    await prisma.propertyImage.createMany({
      data: urls.map((url, idx) => ({
        propertyId,
        imageUrl: url,
        publicId: `seed-${propertyId.slice(0, 8)}-${idx}`,
        isCover: idx === 0,
        order: idx,
      })),
    });
  };
  await seedImages(villa.id, villaImages);
  await seedImages(homestay.id, homestayImages);
  await seedImages(hotel.id, hotelImages);
  console.log('✅ PropertyImages seeded (10 images)');

  // ─── 7. Bookings (5 mix status) ──────────────────────────────────────────
  const booking1Hold = await prisma.booking.create({
    data: {
      propertyId: villa.id,
      saleId: reviewSale.id,
      customerName: 'Nguyễn Văn A',
      customerPhone: '0901111111',
      checkinDate: daysFromNow(5),
      checkoutDate: daysFromNow(7),
      status: BOOKING_STATUS.HOLD,
      holdExpireAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // +24h
      guestCount: 4,
      notes: 'Demo HOLD chờ thanh toán',
    },
  });

  const booking2Confirmed = await prisma.booking.create({
    data: {
      propertyId: villa.id,
      saleId: reviewSale.id,
      customerName: 'Trần Thị B',
      customerPhone: '0902222222',
      checkinDate: daysFromNow(10),
      checkoutDate: daysFromNow(12),
      status: BOOKING_STATUS.CONFIRMED,
      depositAmount: 2000000,
      guestCount: 6,
      notes: 'Demo confirmed booking',
    },
  });

  const booking3Confirmed = await prisma.booking.create({
    data: {
      propertyId: homestay.id,
      saleId: reviewSale.id,
      customerName: 'Lê Văn C',
      customerPhone: '0903333333',
      checkinDate: daysFromNow(3),
      checkoutDate: daysFromNow(4),
      status: BOOKING_STATUS.CONFIRMED,
      depositAmount: 500000,
      guestCount: 2,
      notes: 'Confirmed gần ngày',
    },
  });

  const booking4Completed = await prisma.booking.create({
    data: {
      propertyId: hotel.id,
      saleId: reviewSale.id,
      customerName: 'Phạm D',
      customerPhone: '0904444444',
      checkinDate: daysFromNow(-10),
      checkoutDate: daysFromNow(-8),
      status: BOOKING_STATUS.COMPLETED,
      depositAmount: 2000000,
      guestCount: 2,
      notes: 'Booking đã hoàn thành tuần trước',
    },
  });

  const booking5Cancelled = await prisma.booking.create({
    data: {
      propertyId: villa.id,
      saleId: reviewSale.id,
      customerName: 'Hoàng E',
      customerPhone: '0905555555',
      checkinDate: daysFromNow(-5),
      checkoutDate: daysFromNow(-3),
      status: BOOKING_STATUS.CANCELLED,
      guestCount: 3,
      notes: 'Booking bị huỷ',
    },
  });

  console.log('✅ Bookings seeded (5: 1 HOLD + 2 CONFIRMED + 1 COMPLETED + 1 CANCELLED)');

  // ─── 8. CalendarLocks (block dates cho HOLD + CONFIRMED bookings) ────────
  const lockDataForBooking = async (
    propertyId: string,
    checkin: Date,
    checkout: Date,
    status: number,
  ) => {
    const dates = datesBetween(checkin, checkout);
    if (!dates.length) return;
    await prisma.calendarLock.createMany({
      data: dates.map((d) => ({ propertyId, date: d, status })),
      skipDuplicates: true,
    });
  };
  await lockDataForBooking(villa.id, booking1Hold.checkinDate, booking1Hold.checkoutDate, CALENDAR_LOCK_STATUS.HOLD);
  await lockDataForBooking(villa.id, booking2Confirmed.checkinDate, booking2Confirmed.checkoutDate, CALENDAR_LOCK_STATUS.BOOKED);
  await lockDataForBooking(homestay.id, booking3Confirmed.checkinDate, booking3Confirmed.checkoutDate, CALENDAR_LOCK_STATUS.BOOKED);
  console.log('✅ CalendarLocks seeded for HOLD + CONFIRMED bookings');

  // ─── 9. Notifications cho OWNER ──────────────────────────────────────────
  await prisma.notification.createMany({
    data: [
      {
        userId: reviewOwner.id,
        type: NOTIFICATION_TYPE.BOOKING,
        title: 'Đặt phòng mới',
        subtitle: 'Khách Nguyễn Văn A đặt Villa Hạ Long View Biển',
        targetType: 'booking',
        targetId: booking1Hold.id,
        isRead: false,
        createdAt: hoursAgo(2),
      },
      {
        userId: reviewOwner.id,
        type: NOTIFICATION_TYPE.BOOKING,
        title: 'Booking xác nhận',
        subtitle: 'Booking của Trần Thị B đã được xác nhận',
        targetType: 'booking',
        targetId: booking2Confirmed.id,
        isRead: false,
        createdAt: hoursAgo(24),
      },
      {
        userId: reviewOwner.id,
        type: NOTIFICATION_TYPE.PAYMENT,
        title: 'Thanh toán thành công',
        subtitle: 'Đã nhận 2,000,000 VND đặt cọc',
        targetType: 'booking',
        targetId: booking2Confirmed.id,
        isRead: true,
        createdAt: hoursAgo(24),
      },
      {
        userId: reviewOwner.id,
        type: NOTIFICATION_TYPE.SYSTEM,
        title: 'Chào mừng đến Halong24h',
        subtitle: 'KYC đã được duyệt, trial 30 ngày bắt đầu',
        isRead: true,
        createdAt: hoursAgo(24 * 7),
      },
      {
        userId: reviewOwner.id,
        type: NOTIFICATION_TYPE.BOOKING,
        title: 'Booking hoàn thành',
        subtitle: 'Phạm D đã trả phòng tại Hạ Long Bay Hotel',
        targetType: 'booking',
        targetId: booking4Completed.id,
        isRead: true,
        createdAt: hoursAgo(24 * 8),
      },
    ],
  });
  console.log('✅ Notifications seeded (5)');

  // ─── 10. PartnerKeys (giữ nguyên 5 partner cũ) ───────────────────────────
  await prisma.partnerKey.createMany({
    data: [
      { partnerName: 'Agoda', apiKey: 'KEY-AGODA-123', rateLimit: 100 },
      { partnerName: 'Booking.com', apiKey: 'KEY-BOOKING-123', rateLimit: 150 },
      { partnerName: 'Traveloka', apiKey: 'KEY-TRAVELOKA-123', rateLimit: 200 },
      { partnerName: 'Trip.com', apiKey: 'KEY-TRIP-123', rateLimit: 50 },
      { partnerName: 'Airbnb', apiKey: 'KEY-AIRBNB-123', rateLimit: 300 },
    ],
  });
  console.log('✅ PartnerKeys seeded (5)');

  // ─── 11. AppVersion (iOS + Android) ──────────────────────────────────────
  await prisma.appVersion.createMany({
    data: [
      {
        platform: 'ios',
        latestVersion: '1.0.0',
        minSupportedVersion: '1.0.0',
        releaseNotes: 'Phiên bản đầu tiên — Apple Review',
        storeUrl: 'https://apps.apple.com/app/halong24h',
      },
      {
        platform: 'android',
        latestVersion: '1.0.0',
        minSupportedVersion: '1.0.0',
        releaseNotes: 'Phiên bản đầu tiên',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.halong24h',
      },
    ],
  });
  console.log('✅ AppVersions seeded (2)');

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('');
  console.log('🎉 Seed completed successfully!');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('👤 PERSONAL ADMIN');
  console.log('   admin@halong24h.com / Abcd@1234');
  console.log('');
  console.log('🍎 APPLE REVIEW ACCOUNTS (password: Halong24h@2026)');
  console.log('   CUSTOMER → apple-review-customer@halong24h.com');
  console.log('   OWNER    → apple-review-owner@halong24h.com');
  console.log('               • KYC approved, trial 30d');
  console.log('               • 3 properties (Villa / Homestay / Hotel)');
  console.log('               • 5 bookings (HOLD / CONFIRMED x2 / COMPLETED / CANCELLED)');
  console.log('               • 5 notifications');
  console.log('   SALE     → apple-review-sale@halong24h.com');
  console.log('               • Linked với OWNER demo');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
