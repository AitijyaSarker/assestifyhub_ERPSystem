import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, login, ensureRoles, createShopUser } from './helpers';
import { createProductWithStock } from './catalog';

describe('Inventory ledger', () => {
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

  it('receives, adjusts, and refuses negative stock when disabled', async () => {
    const shop = await prisma.shop.create({
      data: { name: 'Inv', code: `I${Date.now()}`, invoicePrefix: 'I', settings: { create: { allowNegativeStock: false } } },
    });
    const admin = await createShopUser(prisma, `inv${Date.now()}@test.local`, shop.id, 'SUPER_ADMIN');
    const token = (await login(app, admin.user.email, admin.password)).body.data.accessToken as string;
    const product = await createProductWithStock(prisma, shop.id, { qty: '0.000' });
    const supplier = await prisma.supplier.create({ data: { name: `Sup${Date.now()}` } });

    const purchase = await request(app.getHttpServer())
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        shopId: shop.id,
        supplierId: supplier.id,
        referenceNo: `PO${Date.now()}`,
        items: [{ productVariantId: product.variants[0].id, quantity: '4.000', unitPrice: '5.00' }],
      });
    expect([200, 201]).toContain(purchase.status);

    const receive = await request(app.getHttpServer())
      .post(`/api/v1/purchases/${purchase.body.data.id}/receive`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productVariantId: product.variants[0].id, quantity: '4.000' }] });
    expect([200, 201]).toContain(receive.status);

    const afterRecv = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { shopId_productVariantId: { shopId: shop.id, productVariantId: product.variants[0].id } },
    });
    expect(Number(afterRecv.quantityOnHand)).toBe(4);
    const recvMove = await prisma.stockMovement.findFirst({
      where: { shopId: shop.id, movementType: 'PURCHASE_RECEIPT' },
    });
    expect(recvMove).toBeTruthy();

    const adj = await request(app.getHttpServer())
      .post('/api/v1/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({
        shopId: shop.id,
        productVariantId: product.variants[0].id,
        movementType: 'ADJUSTMENT_IN',
        quantityChange: '1.000',
      });
    expect([200, 201]).toContain(adj.status);

    const neg = await request(app.getHttpServer())
      .post('/api/v1/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({
        shopId: shop.id,
        productVariantId: product.variants[0].id,
        movementType: 'ADJUSTMENT_OUT',
        quantityChange: '99.000',
      });
    expect(neg.status).toBe(409);
    expect(neg.body.error.code).toBe('INSUFFICIENT_STOCK');
  });

  it('blocks unauthorized inventory adjustment', async () => {
    const shop = await prisma.shop.create({
      data: { name: 'Inv2', code: `I2${Date.now()}`, invoicePrefix: 'J', settings: { create: {} } },
    });
    const cashier = await createShopUser(prisma, `cash${Date.now()}@test.local`, shop.id, 'SHOP_USER');
    const token = (await login(app, cashier.user.email, cashier.password)).body.data.accessToken as string;
    const product = await createProductWithStock(prisma, shop.id);
    const res = await request(app.getHttpServer())
      .post('/api/v1/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({
        shopId: shop.id,
        productVariantId: product.variants[0].id,
        movementType: 'ADJUSTMENT_IN',
        quantityChange: '1.000',
      });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('enforces unique (shop, variant) balance and unique barcode', async () => {
    const shop = await prisma.shop.create({
      data: { name: 'Inv3', code: `I3${Date.now()}`, invoicePrefix: 'K', settings: { create: {} } },
    });
    const product = await createProductWithStock(prisma, shop.id, { barcode: `BC${Date.now()}` });
    await expect(
      prisma.inventoryBalance.create({
        data: { shopId: shop.id, productVariantId: product.variants[0].id, quantityOnHand: '1.000' },
      }),
    ).rejects.toThrow();
    const admin = await createShopUser(prisma, `bar${Date.now()}@test.local`, shop.id, 'SUPER_ADMIN');
    const token = (await login(app, admin.user.email, admin.password)).body.data.accessToken as string;
    const dup = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Dup',
        productCode: `DUP${Date.now()}`,
        purchasePrice: '1.00',
        sellingPrice: '2.00',
        variants: [
          {
            sku: `DUPSku${Date.now()}`,
            variantName: 'X',
            barcodes: [{ value: product.variants[0] ? (await prisma.barcode.findFirstOrThrow({ where: { variantId: product.variants[0].id } })).value : 'x', format: 'CODE128' }],
          },
        ],
      });
    expect(dup.status).toBeGreaterThanOrEqual(400);
    expect(dup.body.error.code).toBe('BARCODE_ALREADY_EXISTS');
  });
});
