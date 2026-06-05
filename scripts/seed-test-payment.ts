/**
 * Seed test data cho luồng thanh toán manual:
 *  - BillingPlan `rooms_test` giá 10K
 *  - OWNER `owner-test@halong24h.com` / Abcd@1234, KYC approved, trial 7 ngày
 *
 * Chạy: npx ts-node scripts/seed-test-payment.ts
 *
 * Idempotent: chạy lại nhiều lần không tạo trùng.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TEST_EMAIL = 'owner-test@halong24h.com';
const TEST_PASSWORD = 'Abcd@1234';
const TEST_PLAN_ID = 'rooms_test';

async function seedPlan() {
  const existing = await prisma.billingPlan.findUnique({
    where: { id: TEST_PLAN_ID },
  });
  if (existing) {
    console.log(`✓ BillingPlan "${TEST_PLAN_ID}" already exists`);
    return existing;
  }

  // VAT 10%: muốn user trả 10K → minCharge = 10000 / 1.1 ≈ 9091
  // Để totalAmount output = 10000 cho gọn, set vatPct=0 + minCharge=10000
  const plan = await prisma.billingPlan.create({
    data: {
      id: TEST_PLAN_ID,
      name: 'Test Plan (10K)',
      pricePerRoom: 0,
      minCharge: 10000,
      yearlyPrice: 100000,
      maxRooms: 5,
      yearlyDiscountPct: 0,
      vatPct: 0,
      features: ['Test plan only — DO NOT show to real users'],
      active: true,
      sortOrder: 9999,
    },
  });
  console.log(`✓ Created BillingPlan "${TEST_PLAN_ID}" — 10,000 VND/month`);
  return plan;
}

async function seedOwner() {
  const existing = await prisma.user.findUnique({
    where: { email: TEST_EMAIL },
  });
  if (existing && !existing.deletedAt) {
    console.log(`✓ OWNER "${TEST_EMAIL}" already exists (id=${existing.id})`);
    return existing;
  }

  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + 7);

  const user = await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      password: hashedPassword,
      name: 'Test Owner Payment',
      phone: '0900000001',
      role: 1, // OWNER
      isActive: true,
      emailVerified: true,
      kycStatus: 'approved',
      kycBypass: false,
      subscriptionStatus: 'trial',
      subscriptionPlanId: TEST_PLAN_ID,
      subscriptionCycle: 'monthly',
      trialEndsAt: trialEnds,
      nextChargeAt: trialEnds,
    },
  });

  // Tạo Subscription row tương ứng để mark-paid sau có history
  const sub = await prisma.subscription.create({
    data: {
      userId: user.id,
      planId: TEST_PLAN_ID,
      cycle: 'monthly',
      rooms: 1,
      status: 'trial',
      startsAt: new Date(),
      endsAt: trialEnds,
    },
  });

  // Tạo KycSubmission row với status PAYMENT_PENDING — bắt buộc để payment.initiate
  // không throw "submissionNotFound". Đại diện cho user vừa qua KYC, đang mua gói lần đầu.
  const submission = await prisma.kycSubmission.create({
    data: {
      userId: user.id,
      status: 'payment_pending',
    },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { kycSubmissionId: submission.id },
  });
  console.log(`  KycSubmission id: ${submission.id} (status=payment_pending)`);

  console.log(`✓ Created OWNER "${TEST_EMAIL}"`);
  console.log(`  id:           ${user.id}`);
  console.log(`  password:     ${TEST_PASSWORD}`);
  console.log(`  kycStatus:    approved`);
  console.log(`  subscription: trial → ${trialEnds.toISOString()}`);
  console.log(`  Subscription row id: ${sub.id}`);
  return user;
}

async function main() {
  console.log('━'.repeat(60));
  console.log('Seed test payment data');
  console.log('━'.repeat(60));

  await seedPlan();
  const owner = await seedOwner();

  console.log('\n' + '━'.repeat(60));
  console.log('Test instructions');
  console.log('━'.repeat(60));
  console.log(`
1. Login với Swagger (POST /auth/login):
   {
     "identifier": "${TEST_EMAIL}",
     "password":   "${TEST_PASSWORD}"
   }

2. Tạo session (POST /payments/initiate):
   {
     "planId":      "${TEST_PLAN_ID}",
     "cycle":       "monthly",
     "method":      "bank_transfer",
     "rooms":       1,
     "totalAmount": 10000
   }
   → Response bankInfo phải có ACB 21169431 NGUYEN VU NAM

3. Chuyển 10,000 VND vào ACB 21169431 với nội dung CK chính xác
   từ bankInfo.content (vd: "HALONG24H abc-123-def")

4. Login lại với ADMIN → POST /admin/payments/<sessionId>/mark-paid
   {
     "reference": "FT26060512345678"
   }

5. Login lại OWNER → GET /auth/profile
   → subscriptionStatus phải là "active"

OwnerId để tham chiếu: ${owner.id}
`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Seed failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
