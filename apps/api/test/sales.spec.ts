import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, login, ensureRoles, createShopUser } from './helpers';
import { createProductWithStock } from './catalog';

describe('Sales / checkout', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await ensureRoles(prisma);
    await prisma.paymentMethod.upsert({ where: { name: 'CASH' }, update: {}, create: { name: 'CASH' } });
    await prisma.paymentMethod.upsert({ where: { name: 'CARD' }, update: {}, create: { name: 'CARD' } });
    await prisma.systemSetting.upsert({
      where: { key: 'active_currency' },
      update: { value: 'BDT' },
      create: { key: 'active_currency', value: 'BDT' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  async function setupShop() {
    const shop = await prisma.shop.create({
      data: { name: 'S Shop', code: `S${Date.now()}${Math.random()}`.slice(0, 20), invoicePrefix: 'S', settings: { create: {} } },
    });
    const admin = await createShopUser(prisma, `s${Date.now()}${Math.random()}@test.local`, shop.id, 'SUPER_ADMIN');
    const token = (await login(app, admin.user.email, admin.password)).body.data.accessToken as string;
    const cash = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'CASH' } });
    const card = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'CARD' } });
    return { shop, token, cash, card };
  }

  it('completes a normal sale and ignores a wrong client payment amount', async () => {
    const { shop, token, cash } = await setupShop();
    const product = await createProductWithStock(prisma, shop.id, { price: '20.00', qty: '5.000' });
    const res = await request(app.getHttpServer())
      .post('/api/v1/sales/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({
        shopId: shop.id,
        items: [{ productVariantId: product.variants[0].id, quantity: '1.000' }],
        payments: [{ methodId: cash.id, amount: '1.00' }],
      });
    expect([200, 201]).toContain(res.status);
    expect(res.body.data.grandTotal).toBe('20.00');
    expect(res.body.data.payments[0].amount).toBe('20.00');
    const bal = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { shopId_productVariantId: { shopId: shop.id, productVariantId: product.variants[0].id } },
    });
    expect(Number(bal.quantityOnHand)).toBe(4);
    const mov = await prisma.stockMovement.findFirst({ where: { referenceId: res.body.data.id } });
    expect(mov?.movementType).toBe('SALE');
  });

  it('handles multi-item sales and cash with change', async () => {
    const { shop, token, cash } = await setupShop();
    const a = await createProductWithStock(prisma, shop.id, { price: '10.00', qty: '5.000' });
    const b = await createProductWithStock(prisma, shop.id, { price: '15.00', qty: '5.000' });
    const res = await request(app.getHttpServer())
      .post('/api/v1/sales/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({
        shopId: shop.id,
        items: [
          { productVariantId: a.variants[0].id, quantity: '2.000' },
          { productVariantId: b.variants[0].id, quantity: '1.000' },
        ],
        payments: [{ methodId: cash.id, amount: '0.00', amountTendered: '50.00' }],
      });
    expect([200, 201]).toContain(res.status);
    expect(res.body.data.grandTotal).toBe('35.00');
    expect(res.body.data.payments[0].changeGiven).toBe('15.00');
  });

  it('records a digital payment without change', async () => {
    const { shop, token, card } = await setupShop();
    const product = await createProductWithStock(prisma, shop.id, { price: '12.50', qty: '2.000' });
    const res = await request(app.getHttpServer())
      .post('/api/v1/sales/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({
        shopId: shop.id,
        items: [{ productVariantId: product.variants[0].id, quantity: '1.000' }],
        payments: [{ methodId: card.id, amount: '99.00' }],
      });
    expect([200, 201]).toContain(res.status);
    expect(res.body.data.grandTotal).toBe('12.50');
    expect(res.body.data.payments[0].amount).toBe('12.50');
    expect(res.body.data.payments[0].changeGiven).toBeFalsy();
  });

  it('rejects insufficient stock', async () => {
    const { shop, token, cash } = await setupShop();
    const product = await createProductWithStock(prisma, shop.id, { qty: '1.000' });
    const res = await request(app.getHttpServer())
      .post('/api/v1/sales/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({
        shopId: shop.id,
        items: [{ productVariantId: product.variants[0].id, quantity: '2.000' }],
        payments: [{ methodId: cash.id, amount: '40.00' }],
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    const sales = await prisma.sale.count({ where: { shopId: shop.id } });
    expect(sales).toBe(0);
  });

  it('rejects a concurrent second sale of the last unit', async () => {
    const { shop, token, cash } = await setupShop();
    const product = await createProductWithStock(prisma, shop.id, { qty: '1.000' });
    const payload = {
      shopId: shop.id,
      items: [{ productVariantId: product.variants[0].id, quantity: '1.000' }],
      payments: [{ methodId: cash.id, amount: '20.00' }],
    };
    const [a, b] = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/sales/checkout').set('Authorization', `Bearer ${token}`).send(payload),
      request(app.getHttpServer()).post('/api/v1/sales/checkout').set('Authorization', `Bearer ${token}`).send(payload),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toContain(409);
    expect(statuses.some((s) => s === 200 || s === 201)).toBe(true);
    const count = await prisma.sale.count({ where: { shopId: shop.id, status: 'COMPLETED' } });
    expect(count).toBe(1);
  });

  it('keeps sale snapshots after the product is renamed and archived', async () => {
    const { shop, token, cash } = await setupShop();
    const product = await createProductWithStock(prisma, shop.id, { name: 'Original Tee' });
    const res = await request(app.getHttpServer())
      .post('/api/v1/sales/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({
        shopId: shop.id,
        items: [{ productVariantId: product.variants[0].id, quantity: '1.000' }],
        payments: [{ methodId: cash.id, amount: '20.00' }],
      });
    await request(app.getHttpServer())
      .patch(`/api/v1/products/${product.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed Tee' });
    await request(app.getHttpServer())
      .post(`/api/v1/products/${product.id}/archive`)
      .set('Authorization', `Bearer ${token}`);
    const sale = await prisma.sale.findUniqueOrThrow({
      where: { id: res.body.data.id },
      include: { items: true },
    });
    expect(sale.items[0].productNameSnapshot).toBe('Original Tee');
  });
});
