import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';

export class ExchangeItemDto {
  @IsString()
  replacementVariantId!: string;

  @Matches(/^\d+(\.\d{1,3})?$/)
  quantity!: string;
}

export class CompleteExchangeDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExchangeItemDto)
  items!: ExchangeItemDto[];

  @IsOptional()
  @IsString()
  methodId?: string;
}
