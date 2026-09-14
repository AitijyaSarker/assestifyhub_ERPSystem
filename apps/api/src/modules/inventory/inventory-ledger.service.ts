import { Injectable, HttpStatus } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODES } from '@erp/shared-types';
import { d, qty } from '../../common/utils/money';
import { TxClient } from '../../database/transaction.service';

export type ApplyMovementInput = {
  shopId: string;
  productVariantId: string;
  movementType: StockMovementType;
  quantityChange: Decimal.Value;
  referenceType?: string;
  referenceId?: string;
  performedById?: string;
  allowNegative?: boolean;
  target: 'onHand' | 'reserved' | 'damaged';
};

@Injectable()
export class InventoryLedgerService {
  available(onHand: Decimal.Value, reserved: Decimal.Value): Decimal {
    return qty(d(onHand).minus(d(reserved)));
  }

  async apply(tx: TxClient, input: ApplyMovementInput) {
    const change = qty(input.quantityChange);
    const existing = await tx.inventoryBalance.findUnique({
      where: {
        shopId_productVariantId: { shopId: input.shopId, productVariantId: input.productVariantId },
      },
    });

    const balance = existing
      ? existing
      : await tx.inventoryBalance.create({
          data: {
            shopId: input.shopId,
            productVariantId: input.productVariantId,
            quantityOnHand: 0,
            quantityReserved: 0,
            quantityDamaged: 0,
          },
        });

    let onHand = d(balance.quantityOnHand);
    let reserved = d(balance.quantityReserved);
    let damaged = d(balance.quantityDamaged);
    const before = this.fieldValue(input.target, onHand, reserved, damaged);

    if (input.target === 'onHand') onHand = qty(onHand.plus(change));
    if (input.target === 'reserved') reserved = qty(reserved.plus(change));
    if (input.target === 'damaged') damaged = qty(damaged.plus(change));

    if (!input.allowNegative && (onHand.lt(0) || reserved.lt(0) || damaged.lt(0))) {
      throw new AppError(ERROR_CODES.INSUFFICIENT_STOCK, 'Insufficient stock', HttpStatus.CONFLICT);
    }
    if (!input.allowNegative && this.available(onHand, reserved).lt(0)) {
      throw new AppError(ERROR_CODES.INSUFFICIENT_STOCK, 'Insufficient available stock', HttpStatus.CONFLICT);
    }

    const after = this.fieldValue(input.target, onHand, reserved, damaged);

    const updated = await tx.inventoryBalance.updateMany({
      where: { id: balance.id, version: balance.version },
      data: {
        quantityOnHand: onHand.toFixed(3),
        quantityReserved: reserved.toFixed(3),
        quantityDamaged: damaged.toFixed(3),
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new AppError(ERROR_CODES.INSUFFICIENT_STOCK, 'Concurrent stock update, retry', HttpStatus.CONFLICT);
    }

    await tx.stockMovement.create({
      data: {
        shopId: input.shopId,
        productVariantId: input.productVariantId,
        movementType: input.movementType,
        quantityChange: change.toFixed(3),
        quantityBefore: before.toFixed(3),
        quantityAfter: after.toFixed(3),
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        performedById: input.performedById,
      },
    });

    const alertType = onHand.lte(0) ? 'OUT_OF_STOCK' : onHand.lte(d(balance.reorderLevel)) ? 'LOW_STOCK' : null;
    if (alertType) {
      const recipients = await tx.userShop.findMany({ where: { shopId: input.shopId }, select: { userId: true } });
      const variant = await tx.productVariant.findUnique({ where: { id: input.productVariantId }, include: { product: true } });
      if (variant) {
        for (const recipient of recipients) {
          const recent = await tx.notification.findFirst({ where: { userId: recipient.userId, type: alertType, message: { contains: variant.sku }, isRead: false } });
          if (!recent) {
            await tx.notification.create({ data: { userId: recipient.userId, type: alertType, title: alertType === 'OUT_OF_STOCK' ? 'Out of stock' : 'Low stock', message: `${variant.product.name} (${variant.sku}) has ${onHand.toFixed(3)} units remaining.` } });
          }
        }
      }
    }

    return { onHand, reserved, damaged, available: this.available(onHand, reserved) };
  }

  private fieldValue(target: ApplyMovementInput['target'], onHand: Decimal, reserved: Decimal, damaged: Decimal) {
    if (target === 'onHand') return onHand;
    if (target === 'reserved') return reserved;
    return damaged;
  }
}
