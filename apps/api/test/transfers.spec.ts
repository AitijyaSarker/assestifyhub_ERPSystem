import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, login, ensureRoles, createShopUser } from './helpers';
import { createProductWithStock } from './catalog';

describe('Transfers', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await ensureRoles(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('moves stock from source to destination through request → approve → dispatch → receive', async () => {
    const source = await prisma.shop.create({
      data: { name: 'Src', code: `SRC${Date.now()}`, invoicePrefix: 'SRC', settings: { create: {} } },
    });
    const dest = await prisma.shop.create({
      data: { name: 'Dst', code: `DST${Date.now()}`, invoicePrefix: 'DST', settings: { create: {} } },
    });
    const admin = await createShopUser(prisma, `tr${Date.now()}@test.local`, source.id, 'SUPER_ADMIN');
    await prisma.userShop.create({ data: { userId: admin.user.id, shopId: dest.id, isPrimary: false } });
    const token = (await login(app, admin.user.email, admin.password)).body.data.accessToken as string;
    const product = await createProductWithStock(prisma, source.id, { qty: '5.000' });

    const req = await request(app.getHttpServer())
      .post('/api/v1/transfers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sourceShopId: source.id,
        destShopId: dest.id,
        items: [{ productVariantId: product.variants[0].id, quantity: '2.000' }],
      });
    expect([200, 201]).toContain(req.status);
    const id = req.body.data.id as string;
    await request(app.getHttpServer()).post(`/api/v1/transfers/${id}/approve`).set('Authorization', `Bearer ${token}`);
    const dispatched = await request(app.getHttpServer())
      .post(`/api/v1/transfers/${id}/dispatch`)
      .set('Authorization', `Bearer ${token}`);
    expect([200, 201]).toContain(dispatched.status);
    const received = await request(app.getHttpServer())
      .post(`/api/v1/transfers/${id}/receive`)
      .set('Authorization', `Bearer ${token}`);
    expect([200, 201]).toContain(received.status);

    const srcBal = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { shopId_productVariantId: { shopId: source.id, productVariantId: product.variants[0].id } },
    });
    const dstBal = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { shopId_productVariantId: { shopId: dest.id, productVariantId: product.variants[0].id } },
    });
    expect(Number(srcBal.quantityOnHand)).toBe(3);
    expect(Number(dstBal.quantityOnHand)).toBe(2);
  });
});
