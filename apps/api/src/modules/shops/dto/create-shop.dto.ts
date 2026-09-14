import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateShopDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;

  @IsString()
  invoicePrefix!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
