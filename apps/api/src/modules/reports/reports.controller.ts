import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { scopedShopIds } from '../../common/utils/shop-scope';
import { d, money } from '../../common/utils/money';
import { buildDateRangeFilter } from '../../common/utils/date-filter';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import ExcelJS from 'exceljs';

@Controller('reports')
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('dashboard')
  @RequirePermissions('reports.view', 'sales.view.own_shop', 'inventory.view')
  async dashboard(@CurrentUser() user: AuthUser, @Query('shopId') shopId?: string) {
    const shopIds = scopedShopIds(user, shopId);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);
    const shopWhere = shopIds.length ? { shopId: { in: shopIds } } : {};
    const [todaySales, monthSales, products, inventory, pendingReturns, shops, users, trendSales] = await Promise.all([
      this.prisma.sale.findMany({ where: { ...shopWhere, status: 'COMPLETED', createdAt: { gte: startOfDay } }, select: { grandTotal: true, currency: true } }),
      this.prisma.sale.findMany({ where: { ...shopWhere, status: 'COMPLETED', createdAt: { gte: startOfMonth } }, select: { grandTotal: true, currency: true } }),
      this.prisma.product.count({ where: { status: 'ACTIVE' } }),
      this.prisma.inventoryBalance.findMany({ where: shopIds.length ? { shopId: { in: shopIds } } : undefined, select: { quantityOnHand: true, minimumStockLevel: true, reorderLevel: true } }),
      this.prisma.return.count({ where: { ...shopWhere, status: 'PENDING' } }),
      this.prisma.shop.count({ where: { status: 'ACTIVE', ...(shopIds.length ? { id: { in: shopIds } } : {}) } }),
      this.prisma.user.count({ where: { status: 'ACTIVE', ...(shopIds.length ? { userShops: { some: { shopId: { in: shopIds } } } } : {}) } }),
      this.prisma.sale.findMany({ where: { ...shopWhere, status: 'COMPLETED', createdAt: { gte: new Date(Date.now() - 7 * 86400000) } }, include: { items: { include: { variant: { include: { product: true } } } } }, orderBy: { createdAt: 'asc' } }),
    ]);
    const total = (rows: { grandTotal: unknown }[]) => rows.reduce((sum, row) => sum.plus(d(String(row.grandTotal))), d(0));
    const trend = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(Date.now() - (6 - index) * 86400000);
      const key = date.toISOString().slice(0, 10);
      const rows = trendSales.filter((sale) => sale.createdAt.toISOString().slice(0, 10) === key);
      const revenue = rows.reduce((sum, sale) => sum.plus(d(sale.grandTotal)), d(0));
      const cogs = rows.reduce((sum, sale) => sum.plus(sale.items.reduce((inner, item) => inner.plus(d(item.quantity).mul(d(item.variant.product.purchasePrice))), d(0))), d(0));
      return { date: key, revenue: money(revenue).toFixed(2), profit: money(revenue.minus(cogs)).toFixed(2) };
    });
    return {
      today: { sales: money(total(todaySales)).toFixed(2), transactions: todaySales.length, currency: todaySales[0]?.currency ?? 'BDT' },
      month: { sales: money(total(monthSales)).toFixed(2), transactions: monthSales.length },
      products,
      lowStock: inventory.filter((row) => d(row.quantityOnHand).lte(d(row.reorderLevel))).length,
      outOfStock: inventory.filter((row) => d(row.quantityOnHand).lte(0)).length,
      pendingReturns,
      shops,
      activeUsers: users,
      trend,
    };
  }

  @Get('sales')
  @RequirePermissions('reports.view')
  async sales(@CurrentUser() user: AuthUser, @Query('shopId') shopId?: string) {
    const ids = scopedShopIds(user, shopId);
    const sales = await this.prisma.sale.findMany({
      where: {
        status: 'COMPLETED',
        ...(ids.length ? { shopId: { in: ids } } : {}),
      },
    });
    const byCurrency: Record<string, { count: number; grandTotal: string }> = {};
    for (const s of sales) {
      const cur = s.currency;
      const prev = byCurrency[cur] ?? { count: 0, grandTotal: '0.00' };
      byCurrency[cur] = {
        count: prev.count + 1,
        grandTotal: money(d(prev.grandTotal).plus(d(s.grandTotal))).toFixed(2),
      };
    }
    return { byCurrency, note: 'Totals are grouped by snapshot currency and are never mixed.' };
  }

  @Get('sales/summary')
  @RequirePermissions('reports.view')
  async salesSummary(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('shopId') shopId?: string,
  ) {
    const shopIds = scopedShopIds(user, shopId);
    const dateFilter = buildDateRangeFilter(from, to);
    const sales = await this.prisma.sale.findMany({
      where: {
        status: 'COMPLETED',
        ...(shopIds.length ? { shopId: { in: shopIds } } : {}),
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      include: { items: true, payments: { include: { method: true } } },
    });
    const revenue = sales.reduce((sum, sale) => sum.plus(d(sale.grandTotal)), d(0));
    const discounts = sales.reduce((sum, sale) => sum.plus(d(sale.discountTotal)), d(0));
    const paymentMethods: Record<string, string> = {};
    for (const sale of sales) {
      for (const payment of sale.payments) {
        paymentMethods[payment.method.name] = money(d(paymentMethods[payment.method.name] ?? 0).plus(d(payment.amount))).toFixed(2);
      }
    }
    return {
      transactionCount: sales.length,
      revenue: money(revenue).toFixed(2),
      discounts: money(discounts).toFixed(2),
      averageTicket: sales.length ? money(revenue.div(sales.length)).toFixed(2) : '0.00',
      paymentMethods,
    };
  }

  @Get('sales/dimensions')
  @RequirePermissions('reports.view')
  async salesDimensions(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string, @Query('shopId') shopId?: string) {
    const ids = scopedShopIds(user, shopId);
    const dateFilter = buildDateRangeFilter(from, to);
    const sales = await this.prisma.sale.findMany({
      where: { status: 'COMPLETED', ...(ids.length ? { shopId: { in: ids } } : {}), ...(dateFilter ? { createdAt: dateFilter } : {}) },
      include: { shop: true, cashier: true, items: { include: { variant: { include: { product: { include: { category: true } } } } } }, payments: { include: { method: true } } },
    });
    const group = (key: string, value: string, amount: string, target: Record<string, { count: number; total: string }>) => { const current = target[value] ?? { count: 0, total: '0.00' }; target[value] = { count: current.count + 1, total: money(d(current.total).plus(d(amount))).toFixed(2) }; };
    const byShop: Record<string, { count: number; total: string }> = {};
    const byCashier: Record<string, { count: number; total: string }> = {};
    const byPaymentMethod: Record<string, { count: number; total: string }> = {};
    const byProduct: Record<string, { quantity: string; total: string }> = {};
    const byCategory: Record<string, { quantity: string; total: string }> = {};
    for (const sale of sales) {
      group('shop', sale.shop.name, String(sale.grandTotal), byShop);
      group('cashier', sale.cashier.fullName, String(sale.grandTotal), byCashier);
      sale.payments.forEach((payment) => group('payment', payment.method.name, String(payment.amount), byPaymentMethod));
      sale.items.forEach((item) => {
        const product = item.variant.product;
        const productKey = product.name;
        const categoryKey = product.category?.name ?? 'Uncategorized';
        const addItem = (target: Record<string, { quantity: string; total: string }>, key: string) => { const current = target[key] ?? { quantity: '0.000', total: '0.00' }; target[key] = { quantity: d(current.quantity).plus(d(item.quantity)).toFixed(3), total: money(d(current.total).plus(d(item.lineTotal))).toFixed(2) }; };
        addItem(byProduct, productKey); addItem(byCategory, categoryKey);
      });
    }
    return { byShop, byCashier, byPaymentMethod, byProduct, byCategory };
  }

  @Get('sales/export')
  @RequirePermissions('reports.export')
  async exportSales(
    @CurrentUser() user: AuthUser,
    @Query('format') format: 'csv' | 'pdf' | 'xlsx' = 'csv',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('shopId') shopId?: string,
  ) {
    const shopIds = scopedShopIds(user, shopId);
    const dateFilter = buildDateRangeFilter(from, to);
    const sales = await this.prisma.sale.findMany({
      where: {
        status: 'COMPLETED',
        ...(shopIds.length ? { shopId: { in: shopIds } } : {}),
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      include: { shop: true, cashier: true, payments: { include: { method: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const rows = sales.map((sale) => ({
      receiptNumber: sale.receiptNumber,
      date: sale.createdAt.toISOString(),
      shop: sale.shop.name,
      cashier: sale.cashier.fullName,
      currency: sale.currency,
      total: money(sale.grandTotal).toFixed(2),
      paymentMethods: sale.payments.map((payment) => payment.method.name).join('|'),
    }));
    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sales');
      worksheet.columns = [
        { header: 'Receipt', key: 'receiptNumber', width: 20 },
        { header: 'Date', key: 'date', width: 24 },
        { header: 'Shop', key: 'shop', width: 24 },
        { header: 'Cashier', key: 'cashier', width: 24 },
        { header: 'Currency', key: 'currency', width: 12 },
        { header: 'Total', key: 'total', width: 14 },
        { header: 'Payment methods', key: 'paymentMethods', width: 24 },
      ];
      worksheet.addRows(rows);
      worksheet.getRow(1).font = { bold: true };
      const bytes = await workbook.xlsx.writeBuffer();
      return { format, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: 'sales-report.xlsx', contentBase64: Buffer.from(bytes).toString('base64') };
    }
    if (format === 'pdf') {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      let page = pdf.addPage([595, 842]);
      let y = 800;
      const write = (text: string) => {
        if (y < 40) { page = pdf.addPage([595, 842]); y = 800; }
        page.drawText(text.slice(0, 110), { x: 28, y, size: 8, font });
        y -= 14;
      };
      write('Sales Report');
      write('Receipt | Date | Shop | Cashier | Currency | Total | Payment');
      rows.forEach((row) => write(`${row.receiptNumber} | ${row.date} | ${row.shop} | ${row.cashier} | ${row.currency} | ${row.total} | ${row.paymentMethods}`));
      const bytes = await pdf.save();
      return { format, mimeType: 'application/pdf', filename: 'sales-report.pdf', contentBase64: Buffer.from(bytes).toString('base64') };
    }
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csv = [
      ['Receipt', 'Date', 'Shop', 'Cashier', 'Currency', 'Total', 'Payment methods'],
      ...rows.map((row) => [row.receiptNumber, row.date, row.shop, row.cashier, row.currency, row.total, row.paymentMethods]),
    ].map((row) => row.map(escape).join(',')).join('\n');
    return { format: 'csv', mimeType: 'text/csv', filename: 'sales-report.csv', contentBase64: Buffer.from(csv, 'utf8').toString('base64') };
  }

  @Get('inventory')
  @RequirePermissions('reports.view')
  inventory(@CurrentUser() user: AuthUser, @Query('shopId') shopId?: string) {
    const shopIds = scopedShopIds(user, shopId);
    return this.prisma.inventoryBalance.findMany({
      where: shopIds.length ? { shopId: { in: shopIds } } : undefined,
      include: { shop: true, variant: { include: { product: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  @Get('inventory/summary')
  @RequirePermissions('reports.view')
  async inventorySummary(@CurrentUser() user: AuthUser, @Query('shopId') shopId?: string) {
    const ids = scopedShopIds(user, shopId);
    const rows = await this.prisma.inventoryBalance.findMany({ where: ids.length ? { shopId: { in: ids } } : undefined, include: { variant: { include: { product: true } } } });
    const valuation = rows.reduce((sum, row) => sum.plus(d(row.quantityOnHand).mul(d(row.variant.product.purchasePrice))), d(0));
    const damaged = rows.reduce((sum, row) => sum.plus(d(row.quantityDamaged)), d(0));
    return { rows: rows.length, valuation: money(valuation).toFixed(2), damaged: damaged.toFixed(3), lowStock: rows.filter((row) => d(row.quantityOnHand).lte(d(row.reorderLevel))).length, outOfStock: rows.filter((row) => d(row.quantityOnHand).lte(0)).length };
  }

  @Get('returns')
  @RequirePermissions('reports.view')
  async returns(@CurrentUser() user: AuthUser, @Query('shopId') shopId?: string) {
    const shopIds = scopedShopIds(user, shopId);
    const rows = await this.prisma.return.findMany({
      where: shopIds.length ? { shopId: { in: shopIds } } : undefined,
      include: { refund: true },
    });
    const byStatus: Record<string, number> = {};
    let refunded = d(0);
    for (const row of rows) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
      if (row.refund) refunded = refunded.plus(d(row.refund.amount));
    }
    return { count: rows.length, byStatus, refunded: money(refunded).toFixed(2) };
  }

  @Get('profit-loss')
  @RequirePermissions('reports.view')
  async profitLoss(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('shopId') shopId?: string,
  ) {
    const shopIds = scopedShopIds(user, shopId);
    const dateWhere = buildDateRangeFilter(from, to);
    const [sales, expenses, refunds] = await Promise.all([
      this.prisma.sale.findMany({
        where: { status: 'COMPLETED', ...(shopIds.length ? { shopId: { in: shopIds } } : {}), ...(dateWhere ? { createdAt: dateWhere } : {}) },
        include: { items: { include: { variant: { include: { product: true } } } } },
      }),
      this.prisma.expense.findMany({
        where: { ...(shopIds.length ? { OR: [{ shopId: { in: shopIds } }, { shopId: null }] } : {}), ...(dateWhere ? { incurredAt: dateWhere } : {}) },
      }),
      this.prisma.refund.findMany({ where: { processedAt: dateWhere } }),
    ]);
    const revenue = sales.reduce((sum, sale) => sum.plus(d(sale.grandTotal)), d(0));
    const cogs = sales.reduce(
      (sum, sale) => sum.plus(sale.items.reduce((itemSum, item) => itemSum.plus(d(item.quantity).mul(d(item.variant.product.purchasePrice))), d(0))),
      d(0),
    );
    const expenseTotal = expenses.reduce((sum, expense) => sum.plus(d(expense.amount)), d(0));
    const refundTotal = refunds.reduce((sum, refund) => sum.plus(d(refund.amount)), d(0));
    return {
      revenue: money(revenue).toFixed(2),
      cogs: money(cogs).toFixed(2),
      refunds: money(refundTotal).toFixed(2),
      expenses: money(expenseTotal).toFixed(2),
      netProfit: money(revenue.minus(cogs).minus(refundTotal).minus(expenseTotal)).toFixed(2),
    };
  }
}
