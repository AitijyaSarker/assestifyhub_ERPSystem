import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CreateCustomerDto } from './dto/create-customer.dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly prisma: PrismaService) {}

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
  create(@Body() dto: CreateCustomerDto) {
    return this.prisma.customer.create({ data: dto });
  }
}
