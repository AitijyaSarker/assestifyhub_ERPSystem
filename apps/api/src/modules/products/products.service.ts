import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CreateBrandDto, UpdateBrandDto } from './dto/brand.dto';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODES } from '@erp/shared-types';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../../common/types/auth-user';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  categories() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  async createCategory(user: AuthUser, dto: CreateCategoryDto) {
    const row = await this.prisma.category.create({ data: dto });
    await this.audit.write(user, 'CATEGORY_CREATE', 'Category', row.id, null, dto as never);
    return row;
  }

  updateCategory(id: string, dto: UpdateCategoryDto) {
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  brands() {
    return this.prisma.brand.findMany({ orderBy: { name: 'asc' } });
  }

  async createBrand(user: AuthUser, dto: CreateBrandDto) {
    const row = await this.prisma.brand.create({ data: dto });
    await this.audit.write(user, 'BRAND_CREATE', 'Brand', row.id);
    return row;
  }

  updateBrand(id: string, dto: UpdateBrandDto) {
    return this.prisma.brand.update({ where: { id }, data: dto });
  }

  list(search?: string) {
    return this.prisma.product.findMany({
      where: {
        archivedAt: null,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { productCode: { contains: search, mode: 'insensitive' } },
                { variants: { some: { sku: { contains: search, mode: 'insensitive' } } } },
                { variants: { some: { barcodes: { some: { value: search } } } } },
              ],
            }
          : {}),
      },
      include: {
        category: true,
        brand: true,
        supplier: true,
        variants: { include: { barcodes: true } },
        images: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { variants: { include: { barcodes: true } }, category: true, brand: true, images: true },
    });
    if (!product) throw new AppError(ERROR_CODES.PRODUCT_NOT_FOUND, 'Product not found', HttpStatus.NOT_FOUND);
    return product;
  }

  async findByBarcode(value: string) {
    const barcode = await this.prisma.barcode.findUnique({
      where: { value },
      include: { variant: { include: { product: true, barcodes: true } } },
    });
    if (!barcode || barcode.variant.product.status === 'ARCHIVED') {
      throw new AppError(ERROR_CODES.PRODUCT_NOT_FOUND, 'Barcode not found', HttpStatus.NOT_FOUND);
    }
    return barcode.variant;
  }

  async create(user: AuthUser, dto: CreateProductDto) {
    try {
      const variants = dto.variants?.map((variant) => {
        const { attributeValues, ...variantData } = variant;
        return {
        ...variantData,
        attributeValues,
        barcodes: variant.barcodes?.length
          ? variant.barcodes
          : [{ value: `ERP${Date.now().toString(36).toUpperCase()}${randomBytes(4).toString('hex').toUpperCase()}`, format: 'CODE128' }],
        };
      });
      const product = await this.prisma.product.create({
        data: {
          name: dto.name,
          productCode: dto.productCode,
          categoryId: dto.categoryId,
          brandId: dto.brandId,
          supplierId: dto.supplierId,
          description: dto.description,
          purchasePrice: dto.purchasePrice,
          sellingPrice: dto.sellingPrice,
          discount: dto.discount ?? '0',
          taxRate: dto.taxRate ?? '0',
              variants: variants
            ? {
                create: variants.map((v) => ({
                  sku: v.sku,
                  variantName: v.variantName,
                  priceOverride: v.priceOverride,
                  barcodes: v.barcodes ? { create: v.barcodes } : undefined,
                })),
              }
            : undefined,
            images: dto.images ? { create: dto.images } : undefined,
            attributes: dto.attributes ? { create: dto.attributes.map((attribute) => ({ name: attribute.name, values: { create: attribute.values } })) } : undefined,
        },
        include: { variants: { include: { barcodes: true } }, attributes: { include: { values: true } } },
      });
      for (const variantInput of variants ?? []) {
        if (!variantInput.attributeValues?.length) continue;
        const variant = product.variants.find((candidate) => candidate.sku === variantInput.sku);
        if (!variant) continue;
        const values = product.attributes.flatMap((attribute) => attribute.values).filter((value) => variantInput.attributeValues?.includes(value.value));
        if (values.length) await this.prisma.variantAttributeValue.createMany({ data: values.map((value) => ({ variantId: variant.id, valueId: value.id })), skipDuplicates: true });
      }
      await this.audit.write(user, 'PRODUCT_CREATE', 'Product', product.id);
      return product;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new AppError(ERROR_CODES.BARCODE_ALREADY_EXISTS, 'Duplicate barcode, SKU, or product code');
      }
      throw e;
    }
  }

  async update(user: AuthUser, id: string, dto: UpdateProductDto) {
    const existing = await this.get(id);
    if (existing.archivedAt) {
      throw new AppError(ERROR_CODES.PRODUCT_ARCHIVED, 'Product is archived');
    }
    const updated = await this.prisma.product.update({
      where: { id },
      data: dto,
      include: { variants: { include: { barcodes: true } } },
    });
    await this.audit.write(user, 'PRODUCT_UPDATE', 'Product', id, existing as never, dto as never);
    return updated;
  }

  async archive(user: AuthUser, id: string) {
    const updated = await this.prisma.product.update({
      where: { id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    await this.audit.write(user, 'PRODUCT_ARCHIVE', 'Product', id);
    return updated;
  }
}
