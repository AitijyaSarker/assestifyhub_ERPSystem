import { Body, Controller, Get, Patch, Param, Post } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { AuditService } from '../audit/audit.service';

@Controller('suppliers')
export class SuppliersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('suppliers.manage', 'purchases.view')
  list() {
    return this.prisma.supplier.findMany({ orderBy: { name: 'asc' } });
  }

  @Post()
  @RequirePermissions('suppliers.manage')
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateSupplierDto) {
    const row = await this.prisma.supplier.create({ data: dto });
    await this.audit.write(user, 'SUPPLIER_CREATE', 'Supplier', row.id);
    return row;
  }

  @Patch(':id')
  @RequirePermissions('suppliers.manage')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateSupplierDto) {
    const existing = await this.prisma.supplier.findUniqueOrThrow({ where: { id } });
    const row = await this.prisma.supplier.update({ where: { id }, data: dto });
    await this.audit.write(user, 'SUPPLIER_UPDATE', 'Supplier', id, existing as never, dto as never);
    return row;
  }
}
