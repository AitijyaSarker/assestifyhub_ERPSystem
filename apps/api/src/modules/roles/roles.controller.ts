import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@Controller('roles')
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('users.manage')
  list() {
    return this.prisma.role.findMany({ include: { rolePermissions: { include: { permission: true } } } });
  }
}
