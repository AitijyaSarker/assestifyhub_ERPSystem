import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('audit.view')
  async list(@Query('resourceType') resourceType?: string, @Query('action') action?: string, @Query('actorId') actorId?: string) {
    return this.prisma.auditLog.findMany({
      where: { ...(resourceType ? { resourceType } : {}), ...(action ? { action } : {}), ...(actorId ? { actorId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
