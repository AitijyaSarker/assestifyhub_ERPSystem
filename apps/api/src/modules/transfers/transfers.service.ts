import { HttpStatus, Injectable } from '@nestjs/common';
import { StockMovementType, TransferStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TransactionService } from '../../database/transaction.service';
import { InventoryLedgerService } from '../inventory/inventory-ledger.service';
import { CreateTransferDto } from './dto/transfer.dto';
import { AuthUser } from '../../common/types/auth-user';
import { assertShopAccess } from '../../common/utils/shop-scope';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODES } from '@erp/shared-types';
import { qty } from '../../common/utils/money';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tx: TransactionService,
    private readonly ledger: InventoryLedgerService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser) {
    const shopFilter = user.roles.includes('SUPER_ADMIN')
      ? undefined
      : {
          OR: [{ sourceShopId: { in: user.shopIds } }, { destShopId: { in: user.shopIds } }],
        };
    const transfers = await this.prisma.stockTransfer.findMany({
      where: shopFilter,
      include: {
        items: true,
        sourceShop: true,
        destShop: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const variantIds = [...new Set(transfers.flatMap((t) => t.items.map((i) => i.productVariantId)))];
    const variants = variantIds.length
      ? await this.prisma.productVariant.findMany({
          where: { id: { in: variantIds } },
          include: { product: true },
        })
      : [];
    const variantMap = new Map(variants.map((v) => [v.id, v]));

    return transfers.map((t) => ({
      ...t,
      items: t.items.map((item) => ({
        ...item,
        variant: variantMap.get(item.productVariantId),
      })),
    }));
  }

  async request(user: AuthUser, dto: CreateTransferDto) {
    if (dto.sourceShopId === dto.destShopId) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Source and destination shops must differ');
    }
    if (!dto.items.length || dto.items.some((item) => qty(item.quantity).lte(0))) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Transfer quantities must be positive');
    }
    if (!user.roles.includes('SUPER_ADMIN') && !user.shopIds.includes(dto.sourceShopId) && !user.shopIds.includes(dto.destShopId)) {
      throw new AppError(ERROR_CODES.SHOP_ACCESS_DENIED, 'Shop access denied', HttpStatus.FORBIDDEN);
    }
    const count = await this.prisma.stockTransfer.count();
    const row = await this.prisma.stockTransfer.create({
      data: {
        transferNumber: `TR-${String(count + 1).padStart(6, '0')}`,
        sourceShopId: dto.sourceShopId,
        destShopId: dto.destShopId,
        requestedById: user.id,
        items: {
          create: dto.items.map((i) => ({
            productVariantId: i.productVariantId,
            quantity: i.quantity,
          })),
        },
      },
      include: { items: true },
    });
    await this.audit.write(user, 'TRANSFER_REQUEST', 'StockTransfer', row.id);
    const admins = await this.prisma.user.findMany({ where: { status: 'ACTIVE', userRoles: { some: { role: { name: 'SUPER_ADMIN' } } } }, select: { id: true } });
    if (admins.length) await this.prisma.notification.createMany({ data: admins.map((admin) => ({ userId: admin.id, type: 'STOCK_TRANSFER' as const, title: 'Stock transfer requested', message: `${row.transferNumber} requires approval.` })) });
    return row;
  }

  async approve(user: AuthUser, id: string) {
    const t = await this.prisma.stockTransfer.findUniqueOrThrow({ where: { id } });
    if (t.status !== TransferStatus.REQUESTED) {
      throw new AppError(ERROR_CODES.TRANSFER_INVALID_STATE, 'Transfer not in REQUESTED state');
    }
    if (!user.roles.includes('SUPER_ADMIN')) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Only a super admin can approve transfers', HttpStatus.FORBIDDEN);
    }
    const updated = await this.prisma.stockTransfer.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: user.id },
    });
    await this.audit.write(user, 'TRANSFER_APPROVE', 'StockTransfer', id);
    return updated;
  }

  async dispatch(user: AuthUser, id: string) {
    return this.tx.run(async (tx) => {
      const t = await tx.stockTransfer.findUnique({ where: { id }, include: { items: true } });
      if (!t || t.status !== TransferStatus.APPROVED) {
        throw new AppError(ERROR_CODES.TRANSFER_INVALID_STATE, 'Transfer must be APPROVED to dispatch', HttpStatus.CONFLICT);
      }
      assertShopAccess(user, t.sourceShopId);
      for (const item of t.items) {
        await this.ledger.apply(tx, {
          shopId: t.sourceShopId,
          productVariantId: item.productVariantId,
          movementType: StockMovementType.TRANSFER_OUT,
          quantityChange: qty(item.quantity).negated(),
          referenceType: 'TRANSFER',
          referenceId: t.id,
          performedById: user.id,
          allowNegative: false,
          target: 'onHand',
        });
      }
      await tx.stockTransfer.update({ where: { id }, data: { status: 'DISPATCHED' } });
      await this.audit.write(user, 'TRANSFER_DISPATCH', 'StockTransfer', id, null, null, tx);
      const recipients = await tx.userShop.findMany({ where: { shopId: t.destShopId }, select: { userId: true } });
      if (recipients.length) await tx.notification.createMany({ data: recipients.map((recipient) => ({ userId: recipient.userId, type: 'STOCK_TRANSFER' as const, title: 'Stock transfer dispatched', message: `Transfer ${t.id} is ready to receive.` })) });
      return { id, status: 'DISPATCHED' };
    });
  }

  async receive(user: AuthUser, id: string) {
    return this.tx.run(async (tx) => {
      const t = await tx.stockTransfer.findUnique({ where: { id }, include: { items: true } });
      if (!t || t.status !== TransferStatus.DISPATCHED) {
        throw new AppError(ERROR_CODES.TRANSFER_INVALID_STATE, 'Transfer must be DISPATCHED to receive', HttpStatus.CONFLICT);
      }
      assertShopAccess(user, t.destShopId);
      for (const item of t.items) {
        await this.ledger.apply(tx, {
          shopId: t.destShopId,
          productVariantId: item.productVariantId,
          movementType: StockMovementType.TRANSFER_IN,
          quantityChange: qty(item.quantity),
          referenceType: 'TRANSFER',
          referenceId: t.id,
          performedById: user.id,
          allowNegative: true,
          target: 'onHand',
        });
      }
      await tx.stockTransfer.update({
        where: { id },
        data: { status: 'RECEIVED', receivedById: user.id },
      });
      await this.audit.write(user, 'TRANSFER_RECEIVE', 'StockTransfer', id, null, null, tx);
      return { id, status: 'RECEIVED' };
    });
  }
}
