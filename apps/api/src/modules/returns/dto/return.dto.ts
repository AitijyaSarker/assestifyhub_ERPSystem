import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';

export class ReturnItemDto {
  @IsString()
  saleItemId!: string;

  @Matches(/^\d+(\.\d{1,3})?$/)
  quantity!: string;
}

export class CreateReturnDto {
  @IsString()
  shopId!: string;

  @IsString()
  saleId!: string;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsIn(['REFUND', 'EXCHANGE'])
  resolution?: 'REFUND' | 'EXCHANGE';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items!: ReturnItemDto[];
}

export class DecideReturnDto {
  @IsIn(['APPROVED_REFUND', 'APPROVED_EXCHANGE', 'REJECTED'])
  decision!: 'APPROVED_REFUND' | 'APPROVED_EXCHANGE' | 'REJECTED';

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReturnConditionDto)
  itemConditions?: ReturnConditionDto[];
}

export class ReturnConditionDto {
  @IsString()
  returnItemId!: string;

  @IsIn(['SELLABLE', 'DAMAGED'])
  condition!: 'SELLABLE' | 'DAMAGED';
}

export class ProcessRefundDto {
  @IsString()
  methodId!: string;

  @IsOptional()
  @IsString()
  referenceId?: string;
}
