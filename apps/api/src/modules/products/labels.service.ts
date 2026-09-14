import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import bwipjs from 'bwip-js';
import { PrismaService } from '../../database/prisma.service';
import { moneyStr } from '../../common/utils/money';

@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(variantIds: string[], layout: 'single' | 'a4' | 'thermal', quantity = 1) {
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: true, barcodes: true },
    });
    const expanded = variants.flatMap((variant) => Array.from({ length: Math.max(1, Math.min(quantity, 500)) }, () => variant));
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const pageSize = layout === 'thermal' ? ([288, 144] as [number, number]) : ([595.28, 841.89] as [number, number]);

    if (layout === 'a4') {
      let page = pdf.addPage(pageSize);
      let x = 36;
      let y = pageSize[1] - 80;
      for (const v of expanded) {
        await this.drawLabel(pdf, page, font, v, x, y, 170, 70);
        x += 180;
        if (x > 400) {
          x = 36;
          y -= 90;
          if (y < 80) {
            page = pdf.addPage(pageSize);
            y = pageSize[1] - 80;
          }
        }
      }
    } else {
      for (const v of expanded) {
        const page = pdf.addPage(pageSize);
        await this.drawLabel(pdf, page, font, v, 20, pageSize[1] - 90, pageSize[0] - 40, 70);
      }
    }

    const bytes = await pdf.save();
    return { pdfBase64: Buffer.from(bytes).toString('base64'), mimeType: 'application/pdf' };
  }

  private async drawLabel(
    pdf: PDFDocument,
    page: ReturnType<PDFDocument['addPage']>,
    font: Awaited<ReturnType<PDFDocument['embedFont']>>,
    v: {
      variantName: string;
      sku: string;
      priceOverride: unknown;
      product: { name: string; sellingPrice: unknown; currency: string };
      barcodes: { value: string; format: string }[];
    },
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 0.5 });
    const price = moneyStr((v.priceOverride as string | null) ?? (v.product.sellingPrice as string));
    page.drawText(v.product.name.slice(0, 28), { x: x + 6, y: y + h - 12, size: 8, font });
    page.drawText(`${v.variantName}  ${v.sku}`, { x: x + 6, y: y + h - 22, size: 7, font });
    page.drawText(`${v.product.currency} ${price}`, { x: x + 6, y: y + h - 32, size: 8, font });
    const bc = v.barcodes[0];
    if (bc) {
      const png = await bwipjs.toBuffer({
        bcid: bc.format === 'EAN13' ? 'ean13' : bc.format === 'QR' ? 'qrcode' : 'code128',
        text: bc.value,
        scale: 2,
        height: 8,
        includetext: true,
      });
      const img = await pdf.embedPng(png);
      page.drawImage(img, { x: x + 6, y: y + 4, width: Math.min(w - 12, 150), height: 28 });
    }
  }
}
