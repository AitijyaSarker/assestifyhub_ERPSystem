import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('methods')
  @RequirePermissions('payments.view', 'sales.create')
  methods() {
    return this.prisma.paymentMethod.findMany({ where: { isActive: true } });
  }
}
