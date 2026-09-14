import { Injectable, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODES } from '@erp/shared-types';
import { LoginDto } from './dto/login.dto';
import { Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { SecurityService } from '../security/security.service';

const MAX_FAILED = 8;
const LOCK_WINDOW_MIN = 15;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly security: SecurityService,
  ) {}

  async login(dto: LoginDto, ip: string | undefined, userAgent: string | undefined, res: Response) {
    await this.verifyCaptcha(dto.captchaToken, ip);
    if (process.env.NODE_ENV !== 'test') {
      const rateKey = `rl:login:${ip ?? 'unknown'}`;
      const hits = await this.redis.incrWindow(rateKey, 60);
      if (hits > 20) {
        throw new AppError(
          ERROR_CODES.AUTH_INVALID_CREDENTIALS,
          'Too many login attempts',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email.toLowerCase() }, { username: dto.email.toLowerCase() }] },
      include: {
        userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } },
        userShops: true,
      },
    });

    const since = new Date(Date.now() - LOCK_WINDOW_MIN * 60_000);
    const failed = user
      ? await this.prisma.loginAttempt.count({
          where: { userId: user.id, success: false, createdAt: { gte: since } },
        })
      : 0;
    if (user && failed >= MAX_FAILED) {
      await this.prisma.loginAttempt.create({
        data: { userId: user.id, emailTried: dto.email, success: false, ipAddress: ip, userAgent },
      });
      throw new AppError(ERROR_CODES.AUTH_ACCOUNT_LOCKED, 'Account locked after failed attempts', HttpStatus.FORBIDDEN);
    }

    const valid = user ? await argon2.verify(user.passwordHash, dto.password) : false;
    if (!user || !valid || user.status !== 'ACTIVE') {
      await this.prisma.loginAttempt.create({
        data: {
          userId: user?.id,
          emailTried: dto.email,
          success: false,
          ipAddress: ip,
          userAgent,
        },
      });
      if (user && failed >= 2) await this.prisma.securityEvent.create({ data: { userId: user.id, eventType: 'SUSPICIOUS_LOGIN', ipAddress: ip, description: 'Repeated failed login attempts' } });
      throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Invalid credentials', HttpStatus.UNAUTHORIZED);
    }

    const twoFactor = await this.security.verifyLoginOtp(user.id, dto.otpCode);
    const backupVerified = twoFactor.required && !twoFactor.valid ? await this.security.consumeBackupCode(user.id, dto.backupCode) : false;
    if (twoFactor.required && !twoFactor.valid && !backupVerified) {
      await this.prisma.securityEvent.create({
        data: {
          userId: user.id,
          eventType: 'TWO_FACTOR_FAILED',
          ipAddress: ip,
          description: 'Invalid or missing one-time password during login',
        },
      });
      throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Two-factor code required', HttpStatus.UNAUTHORIZED);
    }

    const device = await this.security.registerDevice(user.id, dto.deviceFingerprint, userAgent, ip);
    if (!device.trusted && !twoFactor.valid && !backupVerified) {
      await this.prisma.securityEvent.create({
        data: { userId: user.id, eventType: 'DEVICE_APPROVAL_REQUIRED', ipAddress: ip, description: 'Login blocked pending device approval' },
      });
      throw new AppError(ERROR_CODES.AUTH_DEVICE_APPROVAL_REQUIRED, 'Device approval required', HttpStatus.FORBIDDEN);
    }

    const refreshToken = randomUUID() + randomUUID();
    const refreshTokenHash = await argon2.hash(refreshToken, { type: argon2.argon2id });
    const days = Number(process.env.JWT_REFRESH_EXPIRES_DAYS ?? 7);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        deviceId: device.deviceId ?? undefined,
        ipAddress: ip,
        userAgent,
        expiresAt,
      },
    });

    await this.prisma.loginAttempt.create({
      data: { userId: user.id, emailTried: dto.email, success: true, ipAddress: ip, userAgent },
    });

    const accessToken = await this.jwt.signAsync({ sub: user.id, sid: session.id });
    this.setRefreshCookie(res, refreshToken, expiresAt);

    const roles = user.userRoles.map((ur) => ur.role.name);
    const permissions = [
      ...new Set(user.userRoles.flatMap((ur) => ur.role.rolePermissions.map((rp) => rp.permission.key))),
    ];

    await this.audit.write(
      {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roles,
        permissions,
        shopIds: user.userShops.map((s) => s.shopId),
        sessionId: session.id,
        actorRole: roles.includes('SUPER_ADMIN') ? 'SUPER_ADMIN' : roles[0] ?? 'SHOP_USER',
        deviceInfo: userAgent ?? null,
        ipAddress: ip ?? null,
      },
      'LOGIN',
      'Session',
      session.id,
    );

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roles,
        permissions,
        shopIds: user.userShops.map((s) => s.shopId),
      },
    };
  }

  async refresh(refreshToken: string | undefined, res: Response) {
    if (!refreshToken) {
      throw new AppError(ERROR_CODES.AUTH_SESSION_EXPIRED, 'Missing refresh token', HttpStatus.UNAUTHORIZED);
    }
    const sessions = await this.prisma.session.findMany({
      where: { isRevoked: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    let matched: (typeof sessions)[number] | null = null;
    for (const s of sessions) {
      try {
        if (await argon2.verify(s.refreshTokenHash, refreshToken)) {
          matched = s;
          break;
        }
      } catch {
        /* continue */
      }
    }
    if (!matched) {
      throw new AppError(ERROR_CODES.AUTH_SESSION_REVOKED, 'Refresh token invalid', HttpStatus.UNAUTHORIZED);
    }

    const newRefresh = randomUUID() + randomUUID();
    const refreshTokenHash = await argon2.hash(newRefresh, { type: argon2.argon2id });
    const days = Number(process.env.JWT_REFRESH_EXPIRES_DAYS ?? 7);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await this.prisma.session.update({
      where: { id: matched.id },
      data: { refreshTokenHash, lastActiveAt: new Date(), expiresAt },
    });

    const accessToken = await this.jwt.signAsync({ sub: matched.userId, sid: matched.id });
    this.setRefreshCookie(res, newRefresh, expiresAt);
    return { accessToken };
  }

  async passkeyLogin(userId: string, ip: string | undefined, userAgent: string | undefined, res: Response, fingerprint?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } },
        userShops: true,
      },
    });
    if (!user || user.status !== 'ACTIVE') throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Invalid passkey login', HttpStatus.UNAUTHORIZED);
    const device = await this.security.registerDevice(userId, fingerprint, userAgent, ip);
    if (!device.trusted) throw new AppError(ERROR_CODES.AUTH_DEVICE_APPROVAL_REQUIRED, 'Device approval required', HttpStatus.FORBIDDEN);
    const refreshToken = randomUUID() + randomUUID();
    const refreshTokenHash = await argon2.hash(refreshToken, { type: argon2.argon2id });
    const expiresAt = new Date(Date.now() + Number(process.env.JWT_REFRESH_EXPIRES_DAYS ?? 7) * 24 * 60 * 60 * 1000);
    const session = await this.prisma.session.create({ data: { userId, refreshTokenHash, deviceId: device.deviceId ?? undefined, ipAddress: ip, userAgent, expiresAt } });
    const roles = user.userRoles.map((ur) => ur.role.name);
    const permissions = [...new Set(user.userRoles.flatMap((ur) => ur.role.rolePermissions.map((rp) => rp.permission.key)))];
    const authUser = { id: user.id, email: user.email, fullName: user.fullName, roles, permissions, shopIds: user.userShops.map((shop) => shop.shopId), sessionId: session.id, actorRole: roles.includes('SUPER_ADMIN') ? 'SUPER_ADMIN' : roles[0] ?? 'SHOP_USER', deviceInfo: userAgent ?? null, ipAddress: ip ?? null };
    await this.audit.write(authUser, 'PASSKEY_LOGIN', 'Session', session.id);
    this.setRefreshCookie(res, refreshToken, expiresAt);
    return { accessToken: await this.jwt.signAsync({ sub: user.id, sid: session.id }), user: { id: user.id, email: user.email, fullName: user.fullName, roles, permissions, shopIds: user.userShops.map((shop) => shop.shopId) } };
  }

  async logout(sessionId: string, res: Response) {
    await this.prisma.session.update({ where: { id: sessionId }, data: { isRevoked: true } });
    res.clearCookie('refresh_token', { httpOnly: true, path: '/api/v1/auth' });
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } },
        userShops: true,
      },
    });
    const roles = user.userRoles.map((ur) => ur.role.name);
    const permissions = [
      ...new Set(user.userRoles.flatMap((ur) => ur.role.rolePermissions.map((rp) => rp.permission.key))),
    ];
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles,
      permissions,
      shopIds: user.userShops.map((s) => s.shopId),
    };
  }

  private setRefreshCookie(res: Response, token: string, expiresAt: Date) {
    res.cookie('refresh_token', token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/api/v1/auth',
    });
  }

  private async verifyCaptcha(token: string | undefined, ip: string | undefined) {
    const secret = process.env.CAPTCHA_SECRET;
    if (!secret || process.env.NODE_ENV === 'test') return;
    if (!token) throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Captcha verification required', HttpStatus.UNAUTHORIZED);
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ secret, response: token, remoteip: ip ?? '' }) });
    const result = await response.json() as { success?: boolean };
    if (!result.success) throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Captcha verification failed', HttpStatus.UNAUTHORIZED);
  }
}
