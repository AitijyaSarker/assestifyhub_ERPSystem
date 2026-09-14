import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class AdjustStockDto {
  @IsString()
  shopId!: string;

  @IsString()
  productVariantId!: string;

  @Matches(/^-?\d+(\.\d{1,3})?$/)
  quantityChange!: string;

  @IsIn(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'LOSS'])
  movementType!: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'DAMAGE' | 'LOSS';

  @IsOptional()
  @IsString()
  reason?: string;
}
