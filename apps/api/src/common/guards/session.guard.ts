import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../../database/prisma.service';
import { AppError } from '../errors/app-error';
import { ERROR_CODES } from '@erp/shared-types';
import { AuthUser } from '../types/auth-user';

type JwtPayload = { sub: string; sid: string };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { jwtPayload?: JwtPayload; user?: AuthUser }>();
    const payload = req.jwtPayload;
    if (!payload?.sub || !payload?.sid) {
      throw new AppError(ERROR_CODES.AUTH_SESSION_EXPIRED, 'Invalid session', HttpStatus.UNAUTHORIZED);
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: {
        user: {
          include: {
            userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } },
            userShops: true,
          },
        },
      },
    });

    if (!session || session.userId !== payload.sub) {
      throw new AppError(ERROR_CODES.AUTH_SESSION_EXPIRED, 'Session not found', HttpStatus.UNAUTHORIZED);
    }
    if (session.isRevoked) {
      throw new AppError(ERROR_CODES.AUTH_SESSION_REVOKED, 'Session revoked', HttpStatus.UNAUTHORIZED);
    }
    if (session.expiresAt < new Date()) {
      throw new AppError(ERROR_CODES.AUTH_SESSION_EXPIRED, 'Session expired', HttpStatus.UNAUTHORIZED);
    }

    const idleMinutes = Number(process.env.SESSION_IDLE_TIMEOUT_MINUTES ?? 60);
    const idleMs = idleMinutes * 60_000;
    if (Date.now() - session.lastActiveAt.getTime() > idleMs) {
      await this.prisma.session.update({ where: { id: session.id }, data: { isRevoked: true } });
      throw new AppError(ERROR_CODES.AUTH_SESSION_EXPIRED, 'Session idle timeout exceeded', HttpStatus.UNAUTHORIZED);
    }

    if (session.user.status !== 'ACTIVE') {
      throw new AppError(ERROR_CODES.AUTH_ACCOUNT_LOCKED, 'Account is not active', HttpStatus.FORBIDDEN);
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastActiveAt: new Date() },
    });

    const roles = session.user.userRoles.map((ur) => ur.role.name);
    const permissions = [
      ...new Set(
        session.user.userRoles.flatMap((ur) => ur.role.rolePermissions.map((rp) => rp.permission.key)),
      ),
    ];
    const actorRole = roles.includes('SUPER_ADMIN') ? 'SUPER_ADMIN' : roles[0] ?? 'SHOP_USER';

    req.user = {
      id: session.user.id,
      email: session.user.email,
      fullName: session.user.fullName,
      roles,
      permissions,
      shopIds: session.user.userShops.map((s) => s.shopId),
      sessionId: session.id,
      actorRole,
      deviceInfo: session.userAgent,
      ipAddress: (req.headers['x-forwarded-for'] as string) ?? req.ip ?? null,
    };
    return true;
  }
}
