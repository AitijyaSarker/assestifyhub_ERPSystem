import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';

export class CheckoutItemDto {
  @IsString()
  productVariantId!: string;

  @Matches(/^\d+(\.\d{1,3})?$/)
  quantity!: string;
}

export class CheckoutPaymentDto {
  @IsString()
  methodId!: string;

  @Matches(/^\d+(\.\d{1,2})?$/)
  amount!: string;

  @IsOptional()
  @Matches(/^\d+(\.\d{1,2})?$/)
  amountTendered?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;
}

export class CheckoutDto {
  @IsString()
  shopId!: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['thermal', 'a4'])
  receiptFormat?: 'thermal' | 'a4';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutPaymentDto)
  payments!: CheckoutPaymentDto[];
}

export class VoidSaleDto {
  @IsString()
  reason!: string;
}
