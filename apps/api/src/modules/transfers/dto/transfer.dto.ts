import { Type } from 'class-transformer';
import { IsArray, IsString, Matches, ValidateNested } from 'class-validator';

export class TransferItemDto {
  @IsString()
  productVariantId!: string;

  @Matches(/^\d+(\.\d{1,3})?$/)
  quantity!: string;
}

export class CreateTransferDto {
  @IsString()
  sourceShopId!: string;

  @IsString()
  destShopId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferItemDto)
  items!: TransferItemDto[];
}
