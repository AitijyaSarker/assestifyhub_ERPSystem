import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, login, ensureRoles, createShopUser } from './helpers';
import { createProductWithStock } from './catalog';

describe('Returns / refunds / exchanges', () => {
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

  async function soldItem() {
    const shop = await prisma.shop.create({
      data: { name: 'R Shop', code: `R${Date.now()}${Math.floor(Math.random() * 99)}`, invoicePrefix: 'R', settings: { create: {} } },
    });
    const admin = await createShopUser(prisma, `r${Date.now()}${Math.random()}@test.local`, shop.id, 'SUPER_ADMIN');
    const cashier = await createShopUser(prisma, `csh${Date.now()}@test.local`, shop.id, 'SHOP_USER');
    const cash = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'CASH' } });
    const product = await createProductWithStock(prisma, shop.id, { price: '10.00', qty: '5.000' });
    const token = (await login(app, admin.user.email, admin.password)).body.data.accessToken as string;
    const saleRes = await request(app.getHttpServer())
      .post('/api/v1/sales/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({
        shopId: shop.id,
        items: [{ productVariantId: product.variants[0].id, quantity: '1.000' }],
        payments: [{ methodId: cash.id, amount: '10.00' }],
      });
    return { shop, admin, cashier, cash, product, token, sale: saleRes.body.data };
  }

  it('rejects refund when return is not APPROVED', async () => {
    const { shop, token, cash, sale } = await soldItem();
    const ret = await request(app.getHttpServer())
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        shopId: shop.id,
        saleId: sale.id,
        reason: 'too small',
        items: [{ saleItemId: sale.items[0].id, quantity: '1.000' }],
      });
    expect([200, 201]).toContain(ret.status);
    const refund = await request(app.getHttpServer())
      .post(`/api/v1/returns/${ret.body.data.id}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ methodId: cash.id });
    expect(refund.status).toBe(409);
    expect(refund.body.error.code).toBe('REFUND_NOT_ALLOWED');
  });

  it('rejects invalid sale reference and qty over sold', async () => {
    const { shop, token, sale } = await soldItem();
    const badSale = await request(app.getHttpServer())
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        shopId: shop.id,
        saleId: '00000000-0000-0000-0000-000000000099',
        reason: 'x',
        items: [{ saleItemId: sale.items[0].id, quantity: '1.000' }],
      });
    expect(badSale.status).toBe(404);
    const over = await request(app.getHttpServer())
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        shopId: shop.id,
        saleId: sale.id,
        reason: 'x',
        items: [{ saleItemId: sale.items[0].id, quantity: '9.000' }],
      });
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe('RETURN_QUANTITY_INVALID');
  });

  it('approves a sellable return, refunds, and writes RETURN_SELLABLE movement', async () => {
    const { shop, token, cash, sale, product } = await soldItem();
    const ret = await request(app.getHttpServer())
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        shopId: shop.id,
        saleId: sale.id,
        reason: 'size',
        items: [{ saleItemId: sale.items[0].id, quantity: '1.000' }],
      });
    const decide = await request(app.getHttpServer())
      .post(`/api/v1/returns/${ret.body.data.id}/decide`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        decision: 'APPROVED_REFUND',
        itemConditions: [{ returnItemId: ret.body.data.items[0].id, condition: 'SELLABLE' }],
      });
    expect([200, 201]).toContain(decide.status);
    const refund = await request(app.getHttpServer())
      .post(`/api/v1/returns/${ret.body.data.id}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ methodId: cash.id });
    expect([200, 201]).toContain(refund.status);
    const move = await prisma.stockMovement.findFirst({
      where: { shopId: shop.id, productVariantId: product.variants[0].id, movementType: 'RETURN_SELLABLE' },
    });
    expect(move).toBeTruthy();
  });

  it('rejects a return and blocks unauthorized approval', async () => {
    const { shop, token, sale, cashier } = await soldItem();
    const ret = await request(app.getHttpServer())
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        shopId: shop.id,
        saleId: sale.id,
        reason: 'changed mind',
        items: [{ saleItemId: sale.items[0].id, quantity: '1.000' }],
      });
    const cashierToken = (await login(app, cashier.user.email, cashier.password)).body.data.accessToken as string;
    const denied = await request(app.getHttpServer())
      .post(`/api/v1/returns/${ret.body.data.id}/decide`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ decision: 'APPROVED_REFUND', itemConditions: [] });
    expect(denied.status).toBe(403);
    const rejected = await request(app.getHttpServer())
      .post(`/api/v1/returns/${ret.body.data.id}/decide`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'REJECTED', itemConditions: [] });
    expect([200, 201]).toContain(rejected.status);
    expect(rejected.body.data.status).toBe('REJECTED');
  });

  it('rejects exchange when return is not APPROVED, then completes after approval', async () => {
    const { shop, token, product, sale } = await soldItem();
    const replacement = await createProductWithStock(prisma, shop.id, { price: '12.00', qty: '3.000' });
    const ret = await request(app.getHttpServer())
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        shopId: shop.id,
        saleId: sale.id,
        reason: 'exchange',
        resolution: 'EXCHANGE',
        items: [{ saleItemId: sale.items[0].id, quantity: '1.000' }],
      });
    const early = await request(app.getHttpServer())
      .post(`/api/v1/returns/${ret.body.data.id}/exchange`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ replacementVariantId: replacement.variants[0].id, quantity: '1.000' }] });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('EXCHANGE_NOT_ALLOWED');
    await request(app.getHttpServer())
      .post(`/api/v1/returns/${ret.body.data.id}/decide`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        decision: 'APPROVED_EXCHANGE',
        itemConditions: [{ returnItemId: ret.body.data.items[0].id, condition: 'SELLABLE' }],
      });
    const done = await request(app.getHttpServer())
      .post(`/api/v1/returns/${ret.body.data.id}/exchange`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ replacementVariantId: replacement.variants[0].id, quantity: '1.000' }] });
    expect([200, 201]).toContain(done.status);
    const out = await prisma.stockMovement.findFirst({
      where: { shopId: shop.id, productVariantId: replacement.variants[0].id, movementType: 'EXCHANGE_OUT' },
    });
    expect(out).toBeTruthy();
    expect(product.id).toBeTruthy();
  });
});
