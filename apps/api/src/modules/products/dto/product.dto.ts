import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'barcodeFormatValue', async: false })
class BarcodeFormatValueConstraint implements ValidatorConstraintInterface {
  validate(value: string, args: ValidationArguments) {
    const format = (args.object as CreateBarcodeDto).format ?? 'CODE128';
    if (format === 'EAN13') {
      if (!/^\d{13}$/.test(value)) return false;
      const digits = value.split('').map(Number);
      const checksum = digits.slice(0, 12).reduce((sum, digit, index) => sum + digit * (index % 2 ? 3 : 1), 0);
      return (10 - (checksum % 10)) % 10 === digits[12];
    }
    if (format === 'QR') return value.length >= 3 && value.length <= 200;
    return /^[A-Za-z0-9._-]{3,80}$/.test(value);
  }
  defaultMessage() { return 'Barcode value does not match its selected format'; }
}

export class CreateBarcodeDto {
  @IsString()
  @Validate(BarcodeFormatValueConstraint)
  value!: string;

  @IsOptional()
  @IsIn(['CODE128', 'EAN13', 'QR'])
  format?: string;
}

export class CreateVariantDto {
  @IsString()
  sku!: string;

  @IsString()
  variantName!: string;

  @IsOptional()
  @Matches(/^\d+(\.\d{1,2})?$/)
  priceOverride?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBarcodeDto)
  barcodes?: CreateBarcodeDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attributeValues?: string[];
}

export class ProductImageDto {
  @IsString()
  url!: string;

  @IsOptional()
  isPrimary?: boolean;
}

export class AttributeValueDto {
  @IsString()
  value!: string;
}

export class ProductAttributeDto {
  @IsString()
  name!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeValueDto)
  values!: AttributeValueDto[];
}

export class CreateProductDto {
  @IsString()
  name!: string;

  @IsString()
  productCode!: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Matches(/^(?!0+(?:\.0{1,2})?$)\d+(\.\d{1,2})?$/)
  purchasePrice!: string;

  @Matches(/^(?!0+(?:\.0{1,2})?$)\d+(\.\d{1,2})?$/)
  sellingPrice!: string;

  @IsOptional()
  @Matches(/^\d+(\.\d{1,2})?$/)
  discount?: string;

  @IsOptional()
  @Matches(/^\d+(\.\d{1,2})?$/)
  taxRate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  images?: ProductImageDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductAttributeDto)
  attributes?: ProductAttributeDto[];
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Matches(/^\d+(\.\d{1,2})?$/)
  purchasePrice?: string;

  @IsOptional()
  @Matches(/^\d+(\.\d{1,2})?$/)
  sellingPrice?: string;

  @IsOptional()
  @Matches(/^\d+(\.\d{1,2})?$/)
  discount?: string;
}
