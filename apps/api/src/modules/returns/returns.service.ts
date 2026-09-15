import { HttpStatus, Injectable } from '@nestjs/common';
import { ReturnStatus, StockMovementType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TransactionService } from '../../database/transaction.service';
import { InventoryLedgerService } from '../inventory/inventory-ledger.service';
import { CreateReturnDto, DecideReturnDto, ProcessRefundDto } from './dto/return.dto';
import { AuthUser } from '../../common/types/auth-user';
import { assertShopAccess, scopedShopIds } from '../../common/utils/shop-scope';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODES } from '@erp/shared-types';
import { d, money, qty } from '../../common/utils/money';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tx: TransactionService,
    private readonly ledger: InventoryLedgerService,
    private readonly audit: AuditService,
  ) {}

  list(user: AuthUser, shopId?: string, search?: string, status?: string) {
    const ids = scopedShopIds(user, shopId);
    return this.prisma.return.findMany({
      where: { ...(ids.length ? { shopId: { in: ids } } : {}), ...(status ? { status: status as ReturnStatus } : {}), ...(search ? { OR: [{ returnNumber: { contains: search, mode: 'insensitive' } }, { sale: { receiptNumber: { contains: search, mode: 'insensitive' } } }] } : {}) },
      include: { items: true, evidence: true, decisions: true, refund: true, exchange: true, sale: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(user: AuthUser, dto: CreateReturnDto) {
    assertShopAccess(user, dto.shopId);
    const sale = await this.prisma.sale.findUnique({
      where: { id: dto.saleId },
      include: { items: true },
    });
    if (!sale || sale.shopId !== dto.shopId) {
      throw new AppError(ERROR_CODES.SALE_NOT_FOUND, 'Sale not found', HttpStatus.NOT_FOUND);
    }
    const priorItems = await this.prisma.returnItem.findMany({
      where: { saleItemId: { in: sale.items.map((item) => item.id) }, return: { status: { not: ReturnStatus.REJECTED } } },
      select: { saleItemId: true, quantity: true },
    });
    const priorBySaleItem = new Map<string, ReturnType<typeof qty>>();
    for (const prior of priorItems) priorBySaleItem.set(prior.saleItemId, qty(priorBySaleItem.get(prior.saleItemId) ?? 0).plus(qty(prior.quantity)));
    for (const item of dto.items) {
      const saleItem = sale.items.find((s) => s.id === item.saleItemId);
      if (!saleItem) throw new AppError(ERROR_CODES.RETURN_QUANTITY_INVALID, 'Sale item mismatch');
      if (qty(item.quantity).plus(priorBySaleItem.get(item.saleItemId) ?? 0).gt(qty(saleItem.quantity))) {
        throw new AppError(ERROR_CODES.RETURN_QUANTITY_INVALID, 'Return qty exceeds sold qty');
      }
    }
    const count = await this.prisma.return.count();
    const ret = await this.prisma.return.create({
      data: {
        returnNumber: `RET-${String(count + 1).padStart(6, '0')}`,
        shopId: dto.shopId,
        saleId: dto.saleId,
        customerId: sale.customerId,
        requestedById: user.id,
        status: ReturnStatus.PENDING,
        reason: dto.reason,
        resolution: dto.resolution,
        items: {
          create: dto.items.map((i) => ({ saleItemId: i.saleItemId, quantity: i.quantity })),
        },
      },
      include: { items: true },
    });
    await this.audit.write(user, 'RETURN_CREATE', 'Return', ret.id);
    const admins = await this.prisma.user.findMany({ where: { status: 'ACTIVE', userRoles: { some: { role: { name: 'SUPER_ADMIN' } } } }, select: { id: true } });
    if (admins.length) {
      await this.prisma.notification.createMany({
        data: admins.map((admin) => ({ userId: admin.id, type: 'RETURN_REQUEST' as const, title: 'Return request received', message: `${ret.returnNumber} requires verification.` })),
      });
    }
    return ret;
  }

  async decide(user: AuthUser, id: string, dto: DecideReturnDto) {
    return this.tx.run(async (tx) => {
      const ret = await tx.return.findUnique({
        where: { id },
        include: { items: { include: { saleItem: true } } },
      });
      if (!ret) throw new AppError(ERROR_CODES.RETURN_NOT_FOUND, 'Return not found', HttpStatus.NOT_FOUND);
      assertShopAccess(user, ret.shopId);
      if (ret.status !== ReturnStatus.PENDING) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Return has already been resolved', HttpStatus.CONFLICT);

      if (dto.decision === 'REJECTED') {
        await tx.return.update({ where: { id }, data: { status: 'REJECTED' } });
        await tx.returnDecision.create({
          data: { returnId: id, decidedById: user.id, decision: dto.decision, notes: dto.notes },
        });
        await this.audit.write(user, 'RETURN_REJECT', 'Return', id, null, dto as never, tx);
        await tx.notification.create({ data: { userId: ret.requestedById, type: 'RETURN_REJECTED', title: 'Return rejected', message: `Return ${ret.id} was rejected.` } });
        return { id, status: 'REJECTED' };
      }

      for (const cond of dto.itemConditions ?? []) {
        const item = ret.items.find((i) => i.id === cond.returnItemId);
        if (!item) continue;
        await tx.returnItem.update({ where: { id: item.id }, data: { condition: cond.condition } });
        if (cond.condition === 'SELLABLE') {
          await this.ledger.apply(tx, {
            shopId: ret.shopId,
            productVariantId: item.saleItem.productVariantId,
            movementType: StockMovementType.RETURN_SELLABLE,
            quantityChange: qty(item.quantity),
            referenceType: 'RETURN',
            referenceId: ret.id,
            performedById: user.id,
            allowNegative: true,
            target: 'onHand',
          });
        } else {
          await this.ledger.apply(tx, {
            shopId: ret.shopId,
            productVariantId: item.saleItem.productVariantId,
            movementType: StockMovementType.RETURN_DAMAGED,
            quantityChange: qty(item.quantity),
            referenceType: 'RETURN',
            referenceId: ret.id,
            performedById: user.id,
            allowNegative: true,
            target: 'damaged',
          });
        }
      }

      const status = dto.decision === 'APPROVED_EXCHANGE' ? ReturnStatus.APPROVED : ReturnStatus.APPROVED;
      await tx.return.update({
        where: { id },
        data: {
          status,
          resolution: dto.decision === 'APPROVED_EXCHANGE' ? 'EXCHANGE' : 'REFUND',
        },
      });
      await tx.returnDecision.create({
        data: { returnId: id, decidedById: user.id, decision: dto.decision, notes: dto.notes },
      });
      await this.audit.write(user, 'RETURN_APPROVE', 'Return', id, null, dto as never, tx);
      await tx.notification.create({ data: { userId: ret.requestedById, type: 'RETURN_APPROVED', title: 'Return approved', message: `Return ${ret.id} was approved for ${dto.decision === 'APPROVED_EXCHANGE' ? 'exchange' : 'refund'}.` } });
      return { id, status: 'APPROVED' };
    });
  }

  async refund(user: AuthUser, returnId: string, dto: ProcessRefundDto) {
    return this.tx.run(async (tx) => {
      const ret = await tx.return.findUnique({
        where: { id: returnId },
        include: { items: { include: { saleItem: true } }, sale: true, refund: true },
      });
      if (!ret) throw new AppError(ERROR_CODES.RETURN_NOT_FOUND, 'Return not found', HttpStatus.NOT_FOUND);
      assertShopAccess(user, ret.shopId);
      if (ret.refund) throw new AppError(ERROR_CODES.REFUND_NOT_ALLOWED, 'Refund already processed', HttpStatus.CONFLICT);
      if (ret.status !== ReturnStatus.APPROVED) {
        throw new AppError(ERROR_CODES.REFUND_NOT_ALLOWED, 'Return is not approved', HttpStatus.CONFLICT);
      }
      let amount = d(0);
      for (const item of ret.items) {
        const unit = d(item.saleItem.lineTotal).div(d(item.saleItem.quantity));
        amount = amount.plus(unit.times(d(item.quantity)));
      }
      const refund = await tx.refund.create({
        data: {
          returnId,
          amount: money(amount).toFixed(2),
          currency: ret.sale.currency,
          methodId: dto.methodId,
          referenceId: dto.referenceId,
          processedById: user.id,
        },
      });
      await tx.return.update({ where: { id: returnId }, data: { status: 'COMPLETED' } });
      await this.audit.write(user, 'REFUND_PROCESS', 'Refund', refund.id, null, dto as never, tx);
      await tx.notification.create({ data: { userId: ret.requestedById, type: 'RETURN_APPROVED', title: 'Refund completed', message: `Refund for return ${returnId} was completed.` } });
      return refund;
    });
  }

  async attachEvidence(user: AuthUser, returnId: string, storedName: string) {
    const ret = await this.prisma.return.findUnique({ where: { id: returnId } });
    if (!ret) throw new AppError(ERROR_CODES.RETURN_NOT_FOUND, 'Return not found', HttpStatus.NOT_FOUND);
    assertShopAccess(user, ret.shopId);
    return this.prisma.returnEvidence.create({
      data: { returnId, imageUrl: storedName },
    });
  }
}
