import { HttpStatus, Injectable } from '@nestjs/common';
import { Currency, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TransactionService } from '../../database/transaction.service';
import { SetRateDto, SwitchCurrencyDto } from './dto/currency.dto';
import { AuthUser } from '../../common/types/auth-user';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODES } from '@erp/shared-types';
import { d, money } from '../../common/utils/money';
import { AuditService } from '../audit/audit.service';
import { BackupService } from '../backup/backup.service';

@Injectable()
export class CurrencySwitchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tx: TransactionService,
    private readonly audit: AuditService,
    private readonly backups: BackupService,
  ) {}

  async active() {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: 'active_currency' } });
    return { activeCurrency: (row?.value as Currency) ?? Currency.BDT };
  }

  rates() {
    return this.prisma.exchangeRate.findMany({ orderBy: { effectiveAt: 'desc' }, take: 50 });
  }

  async setRate(user: AuthUser, dto: SetRateDto) {
    const row = await this.prisma.exchangeRate.create({
      data: {
        baseCurrency: dto.baseCurrency,
        targetCurrency: dto.targetCurrency,
        rate: dto.rate,
        setById: user.id,
      },
    });
    await this.audit.write(user, 'EXCHANGE_RATE_SET', 'ExchangeRate', row.id, null, dto as never);
    return row;
  }

  async switchCurrency(user: AuthUser, dto: SwitchCurrencyDto) {
    if (dto.confirmation !== dto.targetCurrency) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Type-to-confirm value must match target currency');
    }
    await this.backups.snapshot(user, `pre-currency-switch-${dto.targetCurrency}`);
    return this.tx.run(async (tx) => {
      const currentRow = await tx.systemSetting.findUnique({ where: { key: 'active_currency' } });
      const current = (currentRow?.value as Currency) ?? Currency.BDT;
      if (current === dto.targetCurrency) {
        return { activeCurrency: current, converted: 0 };
      }

      const rateRow = await tx.exchangeRate.findFirst({
        where: {
          baseCurrency: current,
          targetCurrency: dto.targetCurrency,
        },
        orderBy: { effectiveAt: 'desc' },
      });
      if (!rateRow) {
        throw new AppError(ERROR_CODES.CURRENCY_RATE_NOT_SET, 'No exchange rate set for target currency', HttpStatus.CONFLICT);
      }
      const rate = d(rateRow.rate);

      const products = await tx.product.findMany({ where: { archivedAt: null }, include: { variants: true } });
      let converted = 0;
      for (const p of products) {
        await tx.product.update({
          where: { id: p.id },
          data: {
            sellingPrice: money(d(p.sellingPrice).times(rate)).toFixed(2),
            purchasePrice: money(d(p.purchasePrice).times(rate)).toFixed(2),
            discount: money(d(p.discount).times(rate)).toFixed(2),
            currency: dto.targetCurrency,
          },
        });
        converted += 1;
        for (const v of p.variants) {
          if (v.priceOverride != null) {
            await tx.productVariant.update({
              where: { id: v.id },
              data: { priceOverride: money(d(v.priceOverride).times(rate)).toFixed(2) },
            });
          }
        }
      }

      await tx.systemSetting.upsert({
        where: { key: 'active_currency' },
        update: { value: dto.targetCurrency },
        create: { key: 'active_currency', value: dto.targetCurrency },
      });

      await this.audit.write(
        user,
        'CURRENCY_SWITCH',
        'SystemSetting',
        'active_currency',
        { from: current } as Prisma.InputJsonValue,
        { to: dto.targetCurrency, rate: rate.toString(), productsConverted: converted } as Prisma.InputJsonValue,
        tx,
      );

      return { activeCurrency: dto.targetCurrency, converted, rate: rate.toString() };
    });
  }
}
