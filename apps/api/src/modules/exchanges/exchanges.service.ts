import { HttpStatus, Injectable } from '@nestjs/common';
import { ReturnStatus, StockMovementType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TransactionService } from '../../database/transaction.service';
import { InventoryLedgerService } from '../inventory/inventory-ledger.service';
import { CompleteExchangeDto } from './dto/exchange.dto';
import { AuthUser } from '../../common/types/auth-user';
import { assertShopAccess } from '../../common/utils/shop-scope';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODES } from '@erp/shared-types';
import { d, money, qty } from '../../common/utils/money';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ExchangesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tx: TransactionService,
    private readonly ledger: InventoryLedgerService,
    private readonly audit: AuditService,
  ) {}

  async complete(user: AuthUser, returnId: string, dto: CompleteExchangeDto) {
    return this.tx.run(async (tx) => {
      const ret = await tx.return.findUnique({
        where: { id: returnId },
        include: { items: { include: { saleItem: true } }, sale: true, exchange: true },
      });
      if (!ret) throw new AppError(ERROR_CODES.RETURN_NOT_FOUND, 'Return not found', HttpStatus.NOT_FOUND);
      assertShopAccess(user, ret.shopId);
      if (ret.exchange) throw new AppError(ERROR_CODES.EXCHANGE_NOT_ALLOWED, 'Exchange already processed', HttpStatus.CONFLICT);
      if (ret.status !== ReturnStatus.APPROVED) {
        throw new AppError(ERROR_CODES.EXCHANGE_NOT_ALLOWED, 'Return is not approved', HttpStatus.CONFLICT);
      }

      let originalValue = d(0);
      for (const item of ret.items) {
        const unit = d(item.saleItem.lineTotal).div(d(item.saleItem.quantity));
        originalValue = originalValue.plus(unit.times(d(item.quantity)));
      }

      let replacementValue = d(0);
      for (const item of dto.items) {
        const variant = await tx.productVariant.findUniqueOrThrow({
          where: { id: item.replacementVariantId },
          include: { product: true },
        });
        const unit = money(variant.priceOverride ?? variant.product.sellingPrice);
        replacementValue = replacementValue.plus(unit.times(qty(item.quantity)));
        await this.ledger.apply(tx, {
          shopId: ret.shopId,
          productVariantId: item.replacementVariantId,
          movementType: StockMovementType.EXCHANGE_OUT,
          quantityChange: qty(item.quantity).negated(),
          referenceType: 'EXCHANGE',
          referenceId: returnId,
          performedById: user.id,
          allowNegative: false,
          target: 'onHand',
        });
      }

      const difference = money(replacementValue.minus(originalValue));
      const exchange = await tx.exchange.create({
        data: {
          returnId,
          originalValue: money(originalValue).toFixed(2),
          replacementValue: money(replacementValue).toFixed(2),
          differenceAmount: difference.toFixed(2),
          items: {
            create: await Promise.all(
              dto.items.map(async (i) => {
                const variant = await tx.productVariant.findUniqueOrThrow({
                  where: { id: i.replacementVariantId },
                  include: { product: true },
                });
                return {
                  replacementVariantId: i.replacementVariantId,
                  quantity: i.quantity,
                  unitPrice: money(variant.priceOverride ?? variant.product.sellingPrice).toFixed(2),
                };
              }),
            ),
          },
        },
      });

      if (!difference.isZero() && dto.methodId) {
        await tx.exchangePayment.create({
          data: {
            exchangeId: exchange.id,
            direction: difference.gt(0) ? 'CUSTOMER_PAYS' : 'REFUND_TO_CUSTOMER',
            amount: difference.abs().toFixed(2),
            currency: ret.sale.currency,
            methodId: dto.methodId,
          },
        });
      }

      await tx.return.update({ where: { id: returnId }, data: { status: 'COMPLETED' } });
      await this.audit.write(user, 'EXCHANGE_COMPLETE', 'Exchange', exchange.id, null, dto as never, tx);
      return tx.exchange.findUniqueOrThrow({
        where: { id: exchange.id },
        include: { items: true, payment: true },
      });
    });
  }
}
