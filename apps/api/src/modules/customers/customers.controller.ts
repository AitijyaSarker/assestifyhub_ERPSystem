import { Body, Controller, Get, Patch, Param, Post, Query } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { AuditService } from '../audit/audit.service';

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('customers.manage')
  list(@Query('search') search?: string) {
    return this.prisma.customer.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post()
  @RequirePermissions('customers.manage')
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomerDto) {
    const customer = await this.prisma.customer.create({ data: dto });
    await this.audit.write(user, 'CUSTOMER_CREATE', 'Customer', customer.id);
    return customer;
  }

  @Patch(':id')
  @RequirePermissions('customers.manage')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateCustomerDto) {
    const existing = await this.prisma.customer.findUniqueOrThrow({ where: { id } });
    const customer = await this.prisma.customer.update({ where: { id }, data: dto });
    await this.audit.write(user, 'CUSTOMER_UPDATE', 'Customer', id, existing as never, dto as never);
    return customer;
  }
}
