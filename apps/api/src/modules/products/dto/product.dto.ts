import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export class CreateBarcodeDto {
  @IsString()
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

  @Matches(/^\d+(\.\d{1,2})?$/)
  purchasePrice!: string;

  @Matches(/^\d+(\.\d{1,2})?$/)
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
