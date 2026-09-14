import { Body, Controller, Get, Patch, Param } from '@nestjs/common';
import { IsBoolean, IsEnum } from 'class-validator';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

class PreferenceDto {
  @IsEnum(NotificationType)
  type!: NotificationType;

  @IsBoolean()
  inAppEnabled!: boolean;

  @IsBoolean()
  emailEnabled!: boolean;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('notifications.manage')
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  @Patch(':id/read')
  @RequirePermissions('notifications.manage')
  read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId: user.id },
      data: { isRead: true },
    });
  }

  @Patch('read-all')
  @RequirePermissions('notifications.manage')
  readAll(@CurrentUser() user: AuthUser) {
    return this.prisma.notification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } });
  }

  @Get('preferences')
  @RequirePermissions('notifications.manage')
  preferences(@CurrentUser() user: AuthUser) {
    return this.prisma.notificationPreference.findMany({ where: { userId: user.id }, orderBy: { type: 'asc' } });
  }

  @Patch('preferences')
  @RequirePermissions('notifications.manage')
  preference(@CurrentUser() user: AuthUser, @Body() dto: PreferenceDto) {
    return this.prisma.notificationPreference.upsert({
      where: { userId_type: { userId: user.id, type: dto.type } },
      create: { userId: user.id, type: dto.type, inAppEnabled: dto.inAppEnabled, emailEnabled: dto.emailEnabled },
      update: { inAppEnabled: dto.inAppEnabled, emailEnabled: dto.emailEnabled },
    });
  }
}
