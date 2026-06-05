/**
 * Reset owner-test user về trạng thái mặc định:
 *  - subscriptionStatus = trial (KYC approved, có 7 ngày trial)
 *  - Xoá tất cả PaymentSession đã tạo
 *  - Xoá Subscription rows đã tạo
 *  - KycSubmission về status payment_pending để initiate được
 *
 * Chạy: npx ts-node scripts/reset-test-user.ts
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const TEST_EMAIL = 'owner-test@halong24h.com';
const TEST_PLAN_ID = 'rooms_test';

async function main() {
  const user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (!user) {
    console.log('User not found, run seed-test-payment.ts first');
    return;
  }

  // 1. Xoá payment sessions
  const deletedSessions = await prisma.paymentSession.deleteMany({
    where: { userId: user.id },
  });
  console.log(`✓ Deleted ${deletedSessions.count} payment session(s)`);

  // 2. Xoá subscription rows
  const deletedSubs = await prisma.subscription.deleteMany({
    where: { userId: user.id },
  });
  console.log(`✓ Deleted ${deletedSubs.count} subscription row(s)`);

  // 3. Reset KycSubmission về payment_pending
  const submission = await prisma.kycSubmission.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });
  if (submission) {
    await prisma.kycSubmission.update({
      where: { id: submission.id },
      data: { status: 'payment_pending', approvedAt: null, approvedById: null },
    });
    console.log(`✓ Reset KycSubmission ${submission.id} → payment_pending`);
  } else {
    const newSub = await prisma.kycSubmission.create({
      data: { userId: user.id, status: 'payment_pending' },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { kycSubmissionId: newSub.id },
    });
    console.log(`✓ Created KycSubmission ${newSub.id}`);
  }

  // 4. Tạo lại Subscription trial 7 ngày
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + 7);
  await prisma.subscription.create({
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

  // 5. Update user state
  await prisma.user.update({
    where: { id: user.id },
    data: {
      kycStatus: 'approved',
      kycBypass: false,
      subscriptionStatus: 'trial',
      subscriptionPlanId: TEST_PLAN_ID,
      subscriptionCycle: 'monthly',
      subscriptionProvider: null,
      subscriptionPriceOverride: null,
      subscriptionFrozenAt: null,
      subscriptionFrozenReason: null,
      trialEndsAt: trialEnds,
      nextChargeAt: trialEnds,
      refreshToken: null,
    },
  });

  console.log('\n' + '━'.repeat(60));
  console.log(`✓ Reset done. User now: trial → ${trialEnds.toISOString()}`);
  console.log('━'.repeat(60));
  console.log(`  Email:    ${TEST_EMAIL}`);
  console.log(`  Password: Abcd@1234`);
  console.log(`  Status:   trial (KYC approved, có 7 ngày dùng thử)`);
  console.log(`  Plan ID:  ${TEST_PLAN_ID} (giá 10,000đ/tháng)`);
  console.log('');
  console.log('App có thể:');
  console.log('  1. Login → xem dashboard (trong trial)');
  console.log('  2. Vào "Mua gói" → chọn rooms_test → nhận QR ACB 21169431');
  console.log('  3. Chuyển khoản 10K vào TK đó với nội dung từ QR');
  console.log('  4. App polling /payments/:sessionId/status → đợi admin mark');
  console.log('  5. ADMIN mark-paid trên Swagger → app nhận push + active');
}

main().catch(console.error).finally(() => prisma.$disconnect());
