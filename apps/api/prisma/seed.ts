import { PrismaClient, Currency } from '@prisma/client';
import * as argon2 from 'argon2';
import { ALL_PERMISSION_KEYS, SHOP_USER_PERMISSIONS } from '@erp/shared-types';

const prisma = new PrismaClient();

function moduleOf(key: string): string {
  return key.split('.')[0] ?? 'misc';
}

async function main() {
  for (const key of ALL_PERMISSION_KEYS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, module: moduleOf(key) },
    });
  }

  const allPermissions = await prisma.permission.findMany();

  const superAdmin = await prisma.role.upsert({
    where: { name: 'SUPER_ADMIN' },
    update: {},
    create: { name: 'SUPER_ADMIN', description: 'Full system access' },
  });

  const shopUser = await prisma.role.upsert({
    where: { name: 'SHOP_USER' },
    update: {},
    create: { name: 'SHOP_USER', description: 'Shop cashier / floor user' },
  });

  await prisma.rolePermission.deleteMany({ where: { roleId: superAdmin.id } });
  await prisma.rolePermission.createMany({
    data: allPermissions.map((p) => ({ roleId: superAdmin.id, permissionId: p.id })),
  });

  const shopUserPerms = allPermissions.filter((p) =>
    SHOP_USER_PERMISSIONS.includes(p.key as (typeof SHOP_USER_PERMISSIONS)[number]),
  );
  await prisma.rolePermission.deleteMany({ where: { roleId: shopUser.id } });
  await prisma.rolePermission.createMany({
    data: shopUserPerms.map((p) => ({ roleId: shopUser.id, permissionId: p.id })),
  });

  const methods = ['CASH', 'CARD', 'BANK_TRANSFER', 'MOBILE_PAYMENT'];
  for (const name of methods) {
    await prisma.paymentMethod.upsert({
      where: { name },
      update: {},
      create: { name, isActive: true },
    });
  }

  await prisma.systemSetting.upsert({
    where: { key: 'active_currency' },
    update: {},
    create: { key: 'active_currency', value: Currency.BDT },
  });

  const shopCode = process.env.SEED_SHOP_CODE ?? 'HQ01';
  await prisma.supplier.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Default Supplier',
      company: 'Default',
    },
  });

  const shop = await prisma.shop.upsert({
    where: { code: shopCode },
    update: {},
    create: {
      name: process.env.SEED_SHOP_NAME ?? 'Headquarters',
      code: shopCode,
      invoicePrefix: 'HQ',
      email: 'shop@erp.local',
      settings: { create: { taxRate: 0, allowNegativeStock: false } },
    },
  });

  const email = process.env.SUPER_ADMIN_EMAIL ?? 'admin@erp.local';
  const password = process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMeNow!123';
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const admin = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, status: 'ACTIVE' },
    create: {
      email,
      username: 'superadmin',
      passwordHash,
      fullName: 'Super Admin',
      status: 'ACTIVE',
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: superAdmin.id } },
    update: {},
    create: { userId: admin.id, roleId: superAdmin.id },
  });

  await prisma.userShop.upsert({
    where: { userId_shopId: { userId: admin.id, shopId: shop.id } },
    update: {},
    create: { userId: admin.id, shopId: shop.id, isPrimary: true },
  });

  console.log(`Seeded SUPER_ADMIN ${email} and shop ${shop.code}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
