import 'reflect-metadata';
import { validate } from 'class-validator';
import { CreateBarcodeDto } from '../src/modules/products/dto/product.dto';

describe('Barcode validation', () => {
  it('accepts a valid EAN-13 check digit', async () => {
    const dto = Object.assign(new CreateBarcodeDto(), { value: '4006381333931', format: 'EAN13' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an invalid EAN-13 check digit', async () => {
    const dto = Object.assign(new CreateBarcodeDto(), { value: '4006381333932', format: 'EAN13' });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
