import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';

export class PurchaseItemDto {
  @IsString()
  productVariantId!: string;

  @Matches(/^\d+(\.\d{1,3})?$/)
  quantity!: string;

  @Matches(/^\d+(\.\d{1,2})?$/)
  unitPrice!: string;
}

export class CreatePurchaseDto {
  @IsString()
  shopId!: string;

  @IsString()
  supplierId!: string;

  @IsString()
  referenceNo!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items!: PurchaseItemDto[];
}

export class ReceiveItemDto {
  @IsString()
  productVariantId!: string;

  @Matches(/^\d+(\.\d{1,3})?$/)
  quantity!: string;
}

export class ReceivePurchaseDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveItemDto)
  items!: ReceiveItemDto[];
}
