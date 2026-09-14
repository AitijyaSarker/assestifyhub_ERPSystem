import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TransactionService } from '../../database/transaction.service';
import { InventoryLedgerService } from './inventory-ledger.service';
import { AuthUser } from '../../common/types/auth-user';
import { assertShopAccess, scopedShopIds } from '../../common/utils/shop-scope';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { AuditService } from '../audit/audit.service';
import { d } from '../../common/utils/money';
import { Prisma, StockMovementType } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tx: TransactionService,
    private readonly ledger: InventoryLedgerService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, shopId?: string) {
    const ids = scopedShopIds(user, shopId);
    return this.prisma.inventoryBalance.findMany({
      where: ids.length ? { shopId: { in: ids } } : undefined,
      include: { variant: { include: { product: true } }, shop: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async adjust(user: AuthUser, dto: AdjustStockDto) {
    assertShopAccess(user, dto.shopId);
    const shop = await this.prisma.shop.findUniqueOrThrow({
      where: { id: dto.shopId },
      include: { settings: true },
    });
    const allowNegative = shop.settings?.allowNegativeStock ?? false;
    const change = d(dto.quantityChange);
    const signed =
      dto.movementType === 'ADJUSTMENT_OUT' || dto.movementType === 'DAMAGE' || dto.movementType === 'LOSS'
        ? change.abs().negated()
        : change.abs();
    const target = dto.movementType === 'DAMAGE' ? 'damaged' : 'onHand';

    return this.tx.run(async (tx) => {
      const result = await this.ledger.apply(tx, {
        shopId: dto.shopId,
        productVariantId: dto.productVariantId,
        movementType: dto.movementType as StockMovementType,
        quantityChange: dto.movementType === 'DAMAGE' ? change.abs() : signed,
        referenceType: 'ADJUSTMENT',
        performedById: user.id,
        allowNegative,
        target,
      });
      if (dto.movementType === 'DAMAGE') {
        await this.ledger.apply(tx, {
          shopId: dto.shopId,
          productVariantId: dto.productVariantId,
          movementType: StockMovementType.DAMAGE,
          quantityChange: change.abs().negated(),
          referenceType: 'ADJUSTMENT',
          performedById: user.id,
          allowNegative,
          target: 'onHand',
        });
      }
      await this.audit.write(
        user,
        'INVENTORY_ADJUST',
        'InventoryBalance',
        dto.productVariantId,
        null,
        dto as unknown as Prisma.InputJsonValue,
        tx,
      );
      return result;
    });
  }
}
