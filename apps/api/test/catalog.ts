import { PrismaService } from '../src/database/prisma.service';

export async function createProductWithStock(
  prisma: PrismaService,
  shopId: string,
  opts?: { price?: string; qty?: string; taxRate?: string; barcode?: string; name?: string },
) {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const product = await prisma.product.create({
    data: {
      name: opts?.name ?? `Item ${stamp}`,
      productCode: `P${stamp}`,
      purchasePrice: '5.00',
      sellingPrice: opts?.price ?? '20.00',
      taxRate: opts?.taxRate ?? '0',
      variants: {
        create: {
          sku: `SKU${stamp}`,
          variantName: 'Default',
          barcodes: opts?.barcode ? { create: { value: opts.barcode, format: 'CODE128' } } : undefined,
        },
      },
    },
    include: { variants: true },
  });
  await prisma.inventoryBalance.create({
    data: {
      shopId,
      productVariantId: product.variants[0].id,
      quantityOnHand: opts?.qty ?? '10.000',
    },
  });
  return product;
}
