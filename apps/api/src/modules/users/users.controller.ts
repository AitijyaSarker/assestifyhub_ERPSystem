import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import * as argon2 from 'argon2';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODES } from '@erp/shared-types';

@Controller('users')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('users.manage')
  list() {
    return this.prisma.user.findMany({
      where: { archivedAt: null },
      include: { userRoles: { include: { role: true } }, userShops: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  @RequirePermissions('users.manage')
  async create(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto) {
    const role = await this.prisma.role.findUniqueOrThrow({ where: { name: dto.roleName } });
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }),
        fullName: dto.fullName,
        phone: dto.phone,
        userRoles: { create: { roleId: role.id } },
        userShops: { create: dto.shopIds.map((shopId, i) => ({ shopId, isPrimary: i === 0 })) },
      },
    });
    await this.audit.write(actor, 'USER_CREATE', 'User', user.id);
    return { id: user.id, email: user.email, fullName: user.fullName };
  }

  @Patch(':id/status')
  @RequirePermissions('users.manage')
  async status(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: { status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' }) {
    const updated = await this.prisma.user.update({ where: { id }, data: { status: body.status } });
    if (body.status !== 'ACTIVE') await this.prisma.session.updateMany({ where: { userId: id, isRevoked: false }, data: { isRevoked: true } });
    await this.audit.write(actor, 'USER_STATUS_UPDATE', 'User', id, null, { status: body.status });
    return { id: updated.id, status: updated.status };
  }

  @Post(':id/force-logout')
  @RequirePermissions('users.manage')
  async forceLogout(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    await this.prisma.session.updateMany({ where: { userId: id, isRevoked: false }, data: { isRevoked: true } });
    await this.audit.write(actor, 'USER_FORCE_LOGOUT', 'User', id);
    return { revoked: true };
  }

  @Post(':id/reset-password')
  @RequirePermissions('users.manage')
  async resetPassword(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: { password: string }) {
    if (!body.password || body.password.length < 12 || !/[A-Z]/.test(body.password) || !/[a-z]/.test(body.password) || !/\d/.test(body.password) || !/[^A-Za-z0-9]/.test(body.password)) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Password must be at least 12 characters and include upper, lower, number, and symbol');
    }
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await argon2.hash(body.password, { type: argon2.argon2id }) } });
    await this.prisma.session.updateMany({ where: { userId: id, isRevoked: false }, data: { isRevoked: true } });
    await this.audit.write(actor, 'USER_PASSWORD_RESET', 'User', id);
    return { reset: true };
  }
}
