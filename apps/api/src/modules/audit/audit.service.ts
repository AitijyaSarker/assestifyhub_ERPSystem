import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async write(
    actor: AuthUser | null,
    action: string,
    resourceType: string,
    resourceId: string | null,
    previousValue?: Prisma.InputJsonValue | null,
    newValue?: Prisma.InputJsonValue | null,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        actorId: actor?.id,
        actorRole: actor?.actorRole,
        action,
        resourceType,
        resourceId,
        previousValue: previousValue ?? undefined,
        newValue: newValue ?? undefined,
        ipAddress: actor?.ipAddress,
        deviceInfo: actor?.deviceInfo,
      },
    });
  }
}
