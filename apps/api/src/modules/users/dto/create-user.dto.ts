import { IsArray, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  fullName!: string;

  @IsString()
  roleName!: string;

  @IsArray()
  @IsString({ each: true })
  shopIds!: string[];

  @IsOptional()
  @IsString()
  phone?: string;
}
