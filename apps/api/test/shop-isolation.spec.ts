import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, login, ensureRoles, createShopUser } from './helpers';

describe('Shop isolation (IDOR)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await ensureRoles(prisma);
    await prisma.paymentMethod.upsert({ where: { name: 'CASH' }, update: {}, create: { name: 'CASH' } });
    await prisma.systemSetting.upsert({
      where: { key: 'active_currency' },
      update: { value: 'BDT' },
      create: { key: 'active_currency', value: 'BDT' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks a Shop A user from reading Shop B sales by guessing the id', async () => {
    const shopA = await prisma.shop.create({
      data: { name: 'Shop A', code: `A${Date.now()}`, invoicePrefix: 'A', settings: { create: {} } },
    });
    const shopB = await prisma.shop.create({
      data: { name: 'Shop B', code: `B${Date.now()}`, invoicePrefix: 'B', settings: { create: {} } },
    });
    const userA = await createShopUser(prisma, `a${Date.now()}@test.local`, shopA.id, 'SHOP_USER');
    const admin = await createShopUser(prisma, `adm${Date.now()}@test.local`, shopB.id, 'SUPER_ADMIN');

    const product = await prisma.product.create({
      data: {
        name: 'Tee',
        productCode: `P${Date.now()}`,
        purchasePrice: '10.00',
        sellingPrice: '20.00',
        variants: { create: { sku: `SKU${Date.now()}`, variantName: 'Default' } },
      },
      include: { variants: true },
    });
    await prisma.inventoryBalance.create({
      data: {
        shopId: shopB.id,
        productVariantId: product.variants[0].id,
        quantityOnHand: '5.000',
      },
    });
    const cash = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'CASH' } });

    const adminLogin = await login(app, admin.user.email, admin.password);
    expect(adminLogin.status).toBe(201);
    const adminToken = adminLogin.body.data.accessToken as string;

    const checkout = await request(app.getHttpServer())
      .post('/api/v1/sales/checkout')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        shopId: shopB.id,
        items: [{ productVariantId: product.variants[0].id, quantity: '1.000' }],
        payments: [{ methodId: cash.id, amount: '20.00', amountTendered: '20.00' }],
      });
    expect([200, 201]).toContain(checkout.status);
    const saleId = checkout.body.data.id as string;
    expect(saleId).toBeDefined();

    const aLogin = await login(app, userA.user.email, userA.password);
    expect([200, 201]).toContain(aLogin.status);
    const aToken = aLogin.body.data.accessToken as string;

    const forbidden = await request(app.getHttpServer())
      .get(`/api/v1/sales/${saleId}`)
      .set('Authorization', `Bearer ${aToken}`);

    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('SHOP_ACCESS_DENIED');
  });
});
