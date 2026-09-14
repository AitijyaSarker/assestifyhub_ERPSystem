import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { moneyStr } from '../../common/utils/money';

@Injectable()
export class ReceiptsService {
  async buildPdf(sale: {
    receiptNumber: string;
    currency: string;
    subtotal: unknown;
    discountTotal: unknown;
    taxTotal: unknown;
    grandTotal: unknown;
    createdAt: Date;
    shop: { name: string; address: string | null; phone?: string | null; logoUrl?: string | null; settings?: { receiptFooter: string | null } | null };
    cashier: { fullName: string };
    items: {
      productNameSnapshot: string;
      skuSnapshot: string;
      quantity: unknown;
      unitPrice: unknown;
      lineTotal: unknown;
    }[];
    payments: { amount: unknown; amountTendered?: unknown; method: { name: string }; referenceId?: string | null; changeGiven?: unknown }[];
  }, format: 'thermal' | 'a4' = 'thermal'): Promise<string> {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage(format === 'a4' ? [595, 842] : [226, 500]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    let y = format === 'a4' ? 800 : 480;
    const line = (text: string, size = 8) => {
      page.drawText(text, { x: format === 'a4' ? 36 : 10, y, size, font });
      y -= size + 4;
    };
    line(sale.shop.name, 10);
    if (sale.shop.address) line(sale.shop.address);
    if (sale.shop.phone) line(`Phone: ${sale.shop.phone}`);
    line(`Receipt ${sale.receiptNumber}`);
    line(sale.createdAt.toISOString());
    line(`Cashier: ${sale.cashier.fullName}`);
    line('------------------------------');
    for (const item of sale.items) {
      line(`${item.productNameSnapshot}`);
      line(`${item.skuSnapshot} x${item.quantity} @ ${moneyStr(item.unitPrice as string)}`);
      line(`  ${sale.currency} ${moneyStr(item.lineTotal as string)}`);
    }
    line('------------------------------');
    line(`Subtotal ${sale.currency} ${moneyStr(sale.subtotal as string)}`);
    line(`Discount ${sale.currency} ${moneyStr(sale.discountTotal as string)}`);
    line(`Tax ${sale.currency} ${moneyStr(sale.taxTotal as string)}`);
    line(`TOTAL ${sale.currency} ${moneyStr(sale.grandTotal as string)}`, 10);
    for (const p of sale.payments) {
      line(`${p.method.name} ${moneyStr(p.amount as string)}`);
      if (p.amountTendered != null) line(`Paid ${sale.currency} ${moneyStr(p.amountTendered as string)}`);
      if (p.changeGiven != null) line(`Change ${sale.currency} ${moneyStr(p.changeGiven as string)}`);
      if (p.referenceId) line(`Reference: ${p.referenceId}`);
    }
    line(sale.shop.settings?.receiptFooter ?? 'Returns accepted with receipt and admin approval.');
    line('Thank you for shopping with us.');
    const bytes = await pdf.save();
    return Buffer.from(bytes).toString('base64');
  }
}
