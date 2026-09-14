import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, login, ensureRoles, createShopUser } from './helpers';
import { createProductWithStock } from './catalog';

describe('Currency switch', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await ensureRoles(prisma);
    await prisma.paymentMethod.upsert({ where: { name: 'CASH' }, update: {}, create: { name: 'CASH' } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects switch when no rate is set', async () => {
    await prisma.exchangeRate.deleteMany();
    const shop = await prisma.shop.create({
      data: { name: 'C Shop', code: `C${Date.now()}`, invoicePrefix: 'C', settings: { create: {} } },
    });
    const admin = await createShopUser(prisma, `c${Date.now()}@test.local`, shop.id, 'SUPER_ADMIN');
    await prisma.systemSetting.upsert({
      where: { key: 'active_currency' },
      update: { value: 'BDT' },
      create: { key: 'active_currency', value: 'BDT' },
    });
    const token = (await login(app, admin.user.email, admin.password)).body.data.accessToken as string;
    const res = await request(app.getHttpServer())
      .post('/api/v1/settings/currency/switch')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetCurrency: 'GBP', confirmation: 'GBP' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CURRENCY_RATE_NOT_SET');
  });

  it('converts product prices and leaves historical sales untouched', async () => {
    const shop = await prisma.shop.create({
      data: { name: 'C2 Shop', code: `C2${Date.now()}`, invoicePrefix: 'C2', settings: { create: {} } },
    });
    const admin = await createShopUser(prisma, `c2${Date.now()}@test.local`, shop.id, 'SUPER_ADMIN');
    await prisma.systemSetting.upsert({
      where: { key: 'active_currency' },
      update: { value: 'BDT' },
      create: { key: 'active_currency', value: 'BDT' },
    });
    const token = (await login(app, admin.user.email, admin.password)).body.data.accessToken as string;
    const cash = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'CASH' } });
    const product = await createProductWithStock(prisma, shop.id, { price: '100.00', qty: '3.000' });
    const saleRes = await request(app.getHttpServer())
      .post('/api/v1/sales/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({
        shopId: shop.id,
        items: [{ productVariantId: product.variants[0].id, quantity: '1.000' }],
        payments: [{ methodId: cash.id, amount: '100.00' }],
      });
    expect([200, 201]).toContain(saleRes.status);
    const saleId = saleRes.body.data.id as string;
    const originalTotal = saleRes.body.data.grandTotal as string;

    await request(app.getHttpServer())
      .post('/api/v1/settings/currency/rates')
      .set('Authorization', `Bearer ${token}`)
      .send({ baseCurrency: 'BDT', targetCurrency: 'GBP', rate: '0.010000' });

    const switched = await request(app.getHttpServer())
      .post('/api/v1/settings/currency/switch')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetCurrency: 'GBP', confirmation: 'GBP' });
    expect([200, 201]).toContain(switched.status);

    const updated = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(updated.currency).toBe('GBP');
    expect(Number(updated.sellingPrice)).toBe(1);
    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
    expect(sale.currency).toBe('BDT');
    expect(Number(sale.grandTotal)).toBe(Number(originalTotal));

    const report = await request(app.getHttpServer())
      .get('/api/v1/reports/sales')
      .set('Authorization', `Bearer ${token}`);
    expect(report.body.data.byCurrency.BDT).toBeTruthy();
    expect(report.body.data.byCurrency.BDT.grandTotal).toBeDefined();

    const snapshot = await prisma.backupRecord.findFirst({ orderBy: { createdAt: 'desc' } });
    expect(snapshot).toBeTruthy();
  });
});
