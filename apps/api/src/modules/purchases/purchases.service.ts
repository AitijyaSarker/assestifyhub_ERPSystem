import { Injectable } from '@nestjs/common';
import { Currency, StockMovementType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TransactionService } from '../../database/transaction.service';
import { InventoryLedgerService } from '../inventory/inventory-ledger.service';
import { CreatePurchaseDto, ReceivePurchaseDto } from './dto/purchase.dto';
import { AuthUser } from '../../common/types/auth-user';
import { assertShopAccess, scopedShopIds } from '../../common/utils/shop-scope';
import { d, money, qty } from '../../common/utils/money';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tx: TransactionService,
    private readonly ledger: InventoryLedgerService,
    private readonly audit: AuditService,
  ) {}

  list(user: AuthUser, shopId?: string) {
    const ids = scopedShopIds(user, shopId);
    return this.prisma.purchase.findMany({
      where: ids.length ? { shopId: { in: ids } } : undefined,
      include: { items: true, supplier: true, shop: true, receipts: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(user: AuthUser, dto: CreatePurchaseDto) {
    assertShopAccess(user, dto.shopId);
    const currencyRow = await this.prisma.systemSetting.findUnique({ where: { key: 'active_currency' } });
    const currency = (currencyRow?.value as Currency) ?? Currency.BDT;
    let total = d(0);
    const items = dto.items.map((i) => {
      const line = money(d(i.unitPrice).times(qty(i.quantity)));
      total = total.plus(line);
      return { ...i, total: line.toFixed(2) };
    });
    const purchase = await this.prisma.purchase.create({
      data: {
        shopId: dto.shopId,
        supplierId: dto.supplierId,
        referenceNo: dto.referenceNo,
        notes: dto.notes,
        totalAmount: money(total).toFixed(2),
        currency,
        purchasedAt: new Date(),
        items: {
          create: items.map((i) => ({
            productVariantId: i.productVariantId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            total: i.total,
          })),
        },
      },
      include: { items: true },
    });
    await this.audit.write(user, 'PURCHASE_CREATE', 'Purchase', purchase.id);
    return purchase;
  }

  async receive(user: AuthUser, purchaseId: string, dto: ReceivePurchaseDto) {
    return this.tx.run(async (tx) => {
      const purchase = await tx.purchase.findUniqueOrThrow({
        where: { id: purchaseId },
        include: { items: true },
      });
      assertShopAccess(user, purchase.shopId);
      const receipt = await tx.purchaseReceipt.create({
        data: { purchaseId, receivedAt: new Date(), receivedBy: user.id },
      });
      for (const item of dto.items) {
        await this.ledger.apply(tx, {
          shopId: purchase.shopId,
          productVariantId: item.productVariantId,
          movementType: StockMovementType.PURCHASE_RECEIPT,
          quantityChange: qty(item.quantity),
          referenceType: 'PURCHASE',
          referenceId: purchase.id,
          performedById: user.id,
          allowNegative: false,
          target: 'onHand',
        });
      }
      await this.audit.write(user, 'PURCHASE_RECEIVE', 'Purchase', purchase.id, null, receipt.id, tx);
      return receipt;
    });
  }
}
