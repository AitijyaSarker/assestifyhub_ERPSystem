import { HttpStatus, Injectable } from '@nestjs/common';
import { Currency, StockMovementType } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { TransactionService } from '../../database/transaction.service';
import { InventoryLedgerService } from '../inventory/inventory-ledger.service';
import { CheckoutDto } from './dto/checkout.dto';
import { AuthUser } from '../../common/types/auth-user';
import { assertShopAccess, scopedShopIds } from '../../common/utils/shop-scope';
import { Decimal } from 'decimal.js';
import { d, money, qty } from '../../common/utils/money';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODES } from '@erp/shared-types';
import { AuditService } from '../audit/audit.service';
import { ReceiptsService } from './receipts.service';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tx: TransactionService,
    private readonly ledger: InventoryLedgerService,
    private readonly audit: AuditService,
    private readonly receipts: ReceiptsService,
  ) {}

  async checkout(user: AuthUser, dto: CheckoutDto) {
    assertShopAccess(user, dto.shopId);
    return this.tx.run(async (tx) => {
      const shop = await tx.shop.findUniqueOrThrow({
        where: { id: dto.shopId },
        include: { settings: true },
      });
      const allowNegative = shop.settings?.allowNegativeStock ?? false;
      const shopTax = d(shop.settings?.taxRate ?? 0);
      const currencyRow = await tx.systemSetting.findUnique({ where: { key: 'active_currency' } });
      const currency = (currencyRow?.value as Currency) ?? Currency.BDT;

      let subtotal = d(0);
      let discountTotal = d(0);
      let taxTotal = d(0);
      const lines: {
        productVariantId: string;
        productNameSnapshot: string;
        skuSnapshot: string;
        quantity: string;
        unitPrice: string;
        discount: string;
        taxAmount: string;
        lineTotal: string;
      }[] = [];

      for (const item of dto.items) {
        const variant = await tx.productVariant.findUnique({
          where: { id: item.productVariantId },
          include: { product: true },
        });
        if (!variant || variant.product.status === 'ARCHIVED') {
          throw new AppError(ERROR_CODES.PRODUCT_NOT_FOUND, 'Product not found', HttpStatus.NOT_FOUND);
        }
        const quantity = qty(item.quantity);
        const unit = money(variant.priceOverride ?? variant.product.sellingPrice);
        const discount = money(d(variant.product.discount).times(quantity));
        const lineNet = money(unit.times(quantity).minus(discount));
        const taxRate = d(variant.product.taxRate).plus(shopTax);
        const taxAmount = money(lineNet.times(taxRate).div(100));
        const lineTotal = money(lineNet.plus(taxAmount));
        subtotal = subtotal.plus(unit.times(quantity));
        discountTotal = discountTotal.plus(discount);
        taxTotal = taxTotal.plus(taxAmount);
        lines.push({
          productVariantId: variant.id,
          productNameSnapshot: variant.product.name,
          skuSnapshot: variant.sku,
          quantity: quantity.toFixed(3),
          unitPrice: unit.toFixed(2),
          discount: discount.toFixed(2),
          taxAmount: taxAmount.toFixed(2),
          lineTotal: lineTotal.toFixed(2),
        });
      }

      const grandTotal = money(subtotal.minus(discountTotal).plus(taxTotal));
      if (!dto.payments.length) {
        throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'At least one payment is required');
      }

      let remaining = grandTotal;
      const paymentRows = dto.payments.map((p, index) => {
        const isLast = index === dto.payments.length - 1;
        const offered = p.amountTendered != null ? d(p.amountTendered) : remaining;
        if (isLast && offered.lt(remaining)) {
          throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Payment does not cover total');
        }
        const applied = money(isLast ? remaining : Decimal.min(remaining, offered));
        remaining = money(remaining.minus(applied));
        const change = money(offered.minus(applied));
        return {
          methodId: p.methodId,
          amount: applied.toFixed(2),
          currency,
          amountTendered: p.amountTendered != null ? money(p.amountTendered).toFixed(2) : undefined,
          changeGiven: change.gt(0) ? change.toFixed(2) : undefined,
          referenceId: p.referenceId,
          status: 'COMPLETED' as const,
        };
      });
      if (remaining.gt(0)) {
        throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Payment does not cover total');
      }

      const receiptNumber = `${shop.invoicePrefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;

      const sale = await tx.sale.create({
        data: {
          shopId: dto.shopId,
          receiptNumber,
          customerId: dto.customerId,
          cashierId: user.id,
          status: 'COMPLETED',
          subtotal: money(subtotal).toFixed(2),
          discountTotal: money(discountTotal).toFixed(2),
          taxTotal: money(taxTotal).toFixed(2),
          grandTotal: grandTotal.toFixed(2),
          currency,
          items: { create: lines },
          payments: { create: paymentRows },
        },
        include: { items: true, payments: { include: { method: true } }, shop: { include: { settings: true } }, cashier: true, customer: true },
      });

      for (const line of sale.items) {
        await this.ledger.apply(tx, {
          shopId: dto.shopId,
          productVariantId: line.productVariantId,
          movementType: StockMovementType.SALE,
          quantityChange: qty(line.quantity).negated(),
          referenceType: 'SALE',
          referenceId: sale.id,
          performedById: user.id,
          allowNegative,
          target: 'onHand',
        });
      }

      const pdf = await this.receipts.buildPdf(sale, dto.receiptFormat ?? 'thermal');
      await tx.receipt.create({ data: { saleId: sale.id, pdfUrl: `inline:${sale.id}` } });
      await this.audit.write(user, 'SALE_CHECKOUT', 'Sale', sale.id, null, { receiptNumber }, tx);
      return {
        ...sale,
        subtotal: money(sale.subtotal.toString()).toFixed(2),
        discountTotal: money(sale.discountTotal.toString()).toFixed(2),
        taxTotal: money(sale.taxTotal.toString()).toFixed(2),
        grandTotal: money(sale.grandTotal.toString()).toFixed(2),
        items: sale.items.map((item) => ({
          ...item,
          quantity: qty(item.quantity.toString()).toFixed(3),
          unitPrice: money(item.unitPrice.toString()).toFixed(2),
          discount: money(item.discount.toString()).toFixed(2),
          taxAmount: money(item.taxAmount.toString()).toFixed(2),
          lineTotal: money(item.lineTotal.toString()).toFixed(2),
        })),
        payments: sale.payments.map((payment) => ({
          ...payment,
          amount: money(payment.amount.toString()).toFixed(2),
          amountTendered: payment.amountTendered == null ? null : money(payment.amountTendered.toString()).toFixed(2),
          changeGiven: payment.changeGiven == null ? null : money(payment.changeGiven.toString()).toFixed(2),
        })),
        receiptPdfBase64: pdf,
      };
    });
  }

  async list(user: AuthUser, shopId?: string, search?: string, cashierId?: string, from?: string, to?: string) {
    const ids = scopedShopIds(user, shopId);
    return this.prisma.sale.findMany({
      where: { ...(ids.length ? { shopId: { in: ids } } : {}), ...(cashierId ? { cashierId } : {}), ...(from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}), ...(search ? { OR: [{ receiptNumber: { contains: search, mode: 'insensitive' } }, { customer: { name: { contains: search, mode: 'insensitive' } } }] } : {}) },
      include: { items: true, payments: { include: { method: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async get(user: AuthUser, id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true, payments: { include: { method: true } }, shop: true, customer: true, cashier: true },
    });
    if (!sale) throw new AppError(ERROR_CODES.SALE_NOT_FOUND, 'Sale not found', HttpStatus.NOT_FOUND);
    assertShopAccess(user, sale.shopId);
    return sale;
  }

  async voidSale(user: AuthUser, id: string, reason: string) {
    return this.tx.run(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id }, include: { items: true } });
      if (!sale) throw new AppError(ERROR_CODES.SALE_NOT_FOUND, 'Sale not found', HttpStatus.NOT_FOUND);
      assertShopAccess(user, sale.shopId);
      if (sale.status === 'VOIDED') {
        throw new AppError(ERROR_CODES.SALE_ALREADY_VOIDED, 'Sale already voided');
      }
      await tx.sale.update({ where: { id }, data: { status: 'VOIDED', voidReason: reason } });
      for (const item of sale.items) {
        await this.ledger.apply(tx, {
          shopId: sale.shopId,
          productVariantId: item.productVariantId,
          movementType: StockMovementType.SALE_REVERSAL,
          quantityChange: qty(item.quantity),
          referenceType: 'SALE',
          referenceId: sale.id,
          performedById: user.id,
          allowNegative: true,
          target: 'onHand',
        });
      }
      await this.audit.write(user, 'SALE_VOID', 'Sale', id, null, { reason }, tx);
      return { id, status: 'VOIDED' };
    });
  }
}
