import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Tài khoản Admin mặc định
  // Dùng "phone" field như username cho admin
  const adminPhone = process.env.ADMIN_PHONE || 'Admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Abcd@1234';
  const adminName = process.env.ADMIN_NAME || 'Super Admin';

  const existingAdmin = await prisma.user.findUnique({ where: { phone: adminPhone } });
  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({
      data: {
        name: adminName,
        phone: adminPhone,
        password: hashedPassword,
        role: Role.ADMIN,
      },
    });
    console.log(`✅ Admin created (username: ${adminPhone})`);
  } else {
    // Cập nhật password nếu admin đã tồn tại
    const isMatch = await bcrypt.compare(adminPassword, existingAdmin.password);
    if (!isMatch) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await prisma.user.update({
        where: { phone: adminPhone },
        data: { password: hashedPassword, name: adminName },
      });
      console.log(`✅ Admin password updated`);
    } else {
      console.log('ℹ️  Admin already exists');
    }
  }

  console.log('✅ Seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
