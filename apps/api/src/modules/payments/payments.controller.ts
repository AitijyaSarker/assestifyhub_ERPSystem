import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../../database/prisma.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { AuditService } from '../audit/audit.service';

class PaymentMethodDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('methods')
  @RequirePermissions('payments.view', 'sales.create')
  methods() {
    return this.prisma.paymentMethod.findMany({ where: { isActive: true } });
  }

  @Get('methods/all')
  @RequirePermissions('payments.configure')
  allMethods() {
    return this.prisma.paymentMethod.findMany({ orderBy: { name: 'asc' } });
  }

  @Post('methods')
  @RequirePermissions('payments.configure')
  async create(@CurrentUser() user: AuthUser, @Body() dto: PaymentMethodDto) {
    const method = await this.prisma.paymentMethod.create({ data: { name: dto.name, isActive: dto.isActive ?? true } });
    await this.audit.write(user, 'PAYMENT_METHOD_CREATE', 'PaymentMethod', method.id, null, dto as never);
    return method;
  }

  @Patch('methods/:id')
  @RequirePermissions('payments.configure')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PaymentMethodDto) {
    const existing = await this.prisma.paymentMethod.findUniqueOrThrow({ where: { id } });
    const method = await this.prisma.paymentMethod.update({ where: { id }, data: dto });
    await this.audit.write(user, 'PAYMENT_METHOD_UPDATE', 'PaymentMethod', id, existing as never, dto as never);
    return method;
  }
}
