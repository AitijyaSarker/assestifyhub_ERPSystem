import { IsIn, IsString, Matches } from 'class-validator';

export class SetRateDto {
  @IsIn(['BDT', 'GBP'])
  baseCurrency!: 'BDT' | 'GBP';

  @IsIn(['BDT', 'GBP'])
  targetCurrency!: 'BDT' | 'GBP';

  @Matches(/^\d+(\.\d{1,6})?$/)
  rate!: string;
}

export class SwitchCurrencyDto {
  @IsIn(['BDT', 'GBP'])
  targetCurrency!: 'BDT' | 'GBP';

  @IsString()
  confirmation!: string;
}
