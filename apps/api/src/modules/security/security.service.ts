import { HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes as secureRandomBytes, timingSafeEqual } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODES } from '@erp/shared-types';
import { RedisService } from '../../common/redis/redis.service';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';

@Injectable()
export class SecurityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
  ) {}

  async beginTwoFactorSetup(user: AuthUser) {
    const secret = this.generateTotpSecret();
    const encryptedSecret = this.encryptSecret(secret);
    await this.prisma.twoFactorCredential.upsert({
      where: { userId: user.id },
      create: { userId: user.id, secretHash: encryptedSecret, isEnabled: false },
      update: { secretHash: encryptedSecret, isEnabled: false, enabledAt: null },
    });
    return {
      issuer: process.env.TOTP_ISSUER ?? 'ERP POS',
      account: user.email,
      secret,
      uri: this.totpUri(user.email, secret),
    };
  }

  async confirmTwoFactor(user: AuthUser, code: string) {
    const credential = await this.prisma.twoFactorCredential.findUnique({ where: { userId: user.id } });
    if (!credential) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Start two-factor setup first');
    if (!this.verifyTotp(this.decryptSecret(credential.secretHash), code)) throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Invalid two-factor code', HttpStatus.UNAUTHORIZED);
    await this.prisma.twoFactorCredential.update({
      where: { userId: user.id },
      data: { isEnabled: true, enabledAt: new Date() },
    });
    await this.audit.write(user, 'TWO_FACTOR_ENABLED', 'TwoFactorCredential', user.id);
    return { enabled: true };
  }

  async disableTwoFactor(user: AuthUser, code: string) {
    const credential = await this.prisma.twoFactorCredential.findUnique({ where: { userId: user.id } });
    if (!credential?.isEnabled) return { enabled: false };
    if (!this.verifyTotp(this.decryptSecret(credential.secretHash), code)) throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Invalid two-factor code', HttpStatus.UNAUTHORIZED);
    await this.prisma.twoFactorCredential.update({ where: { userId: user.id }, data: { isEnabled: false } });
    await this.audit.write(user, 'TWO_FACTOR_DISABLED', 'TwoFactorCredential', user.id);
    return { enabled: false };
  }

  async verifyLoginOtp(userId: string, code?: string) {
    const credential = await this.prisma.twoFactorCredential.findUnique({ where: { userId } });
    if (!credential?.isEnabled) return { required: false, valid: true };
    if (!code) return { required: true, valid: false };
    return { required: true, valid: this.verifyTotp(this.decryptSecret(credential.secretHash), code) };
  }

  async twoFactorStatus(user: AuthUser) {
    const credential = await this.prisma.twoFactorCredential.findUnique({ where: { userId: user.id }, select: { isEnabled: true, enabledAt: true } });
    const backupCodesRemaining = await this.prisma.backupCode.count({ where: { userId: user.id, usedAt: null, revokedAt: null } });
    return { enabled: credential?.isEnabled ?? false, enabledAt: credential?.enabledAt ?? null, backupCodesRemaining };
  }

  events() {
    return this.prisma.securityEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  sessions(user: AuthUser) {
    if (!user.roles.includes('SUPER_ADMIN')) {
      return this.prisma.session.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    }
    return this.prisma.session.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async registerDevice(userId: string, fingerprint: string | undefined, userAgent: string | undefined, ipAddress: string | undefined) {
    if (!fingerprint) return { trusted: true, deviceId: null };
    const device = await this.prisma.device.upsert({
      where: { userId_fingerprint: { userId, fingerprint } },
      create: { userId, fingerprint, browser: userAgent },
      update: { browser: userAgent },
      include: { trusted: true },
    });
    if (device.trusted) return { trusted: true, deviceId: device.id };
    const existing = await this.prisma.deviceLoginRequest.findFirst({ where: { userId, deviceId: device.id, status: 'PENDING' } });
    if (!existing) {
      await this.prisma.deviceLoginRequest.create({ data: { userId, deviceId: device.id, ipAddress } });
      await this.prisma.notification.create({
        data: {
          userId,
          type: 'NEW_DEVICE_LOGIN',
          title: 'New device login requires approval',
          message: `A login attempt from ${userAgent ?? 'an unknown device'} at ${ipAddress ?? 'an unknown IP'} is waiting for approval.`,
        },
      });
    }
    return { trusted: false, deviceId: device.id };
  }

  deviceRequests(user: AuthUser) {
    return this.prisma.deviceLoginRequest.findMany({
      where: user.roles.includes('SUPER_ADMIN') ? undefined : { userId: user.id },
      include: { device: true, user: { select: { id: true, email: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveDevice(user: AuthUser, requestId: string) {
    const request = await this.prisma.deviceLoginRequest.findUnique({ where: { id: requestId } });
    if (!request || request.status !== 'PENDING') throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Pending device request not found', HttpStatus.NOT_FOUND);
    if (!user.roles.includes('SUPER_ADMIN') && request.userId !== user.id) {
      throw new AppError(ERROR_CODES.PERMISSION_DENIED, 'Device request not found', HttpStatus.NOT_FOUND);
    }
    const updated = await this.prisma.deviceLoginRequest.update({ where: { id: requestId }, data: { status: 'APPROVED', resolvedAt: new Date() } });
    await this.prisma.trustedDevice.upsert({ where: { deviceId: request.deviceId }, create: { deviceId: request.deviceId }, update: {} });
    await this.audit.write(user, 'DEVICE_APPROVED', 'DeviceLoginRequest', requestId);
    return updated;
  }

  async rejectDevice(user: AuthUser, requestId: string) {
    const request = await this.prisma.deviceLoginRequest.findUnique({ where: { id: requestId } });
    if (!request || request.status !== 'PENDING') throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Pending device request not found', HttpStatus.NOT_FOUND);
    if (!user.roles.includes('SUPER_ADMIN') && request.userId !== user.id) {
      throw new AppError(ERROR_CODES.PERMISSION_DENIED, 'Device request not found', HttpStatus.NOT_FOUND);
    }
    const updated = await this.prisma.deviceLoginRequest.update({ where: { id: requestId }, data: { status: 'REJECTED', resolvedAt: new Date() } });
    await this.audit.write(user, 'DEVICE_REJECTED', 'DeviceLoginRequest', requestId);
    return updated;
  }

  async revokeSession(user: AuthUser, sessionId: string) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || (!user.roles.includes('SUPER_ADMIN') && session.userId !== user.id)) throw new AppError(ERROR_CODES.PERMISSION_DENIED, 'Session not found', HttpStatus.NOT_FOUND);
    await this.prisma.session.update({ where: { id: sessionId }, data: { isRevoked: true } });
    await this.audit.write(user, 'SESSION_REVOKED', 'Session', sessionId);
    return { revoked: true };
  }

  async revokeOtherSessions(user: AuthUser) {
    const result = await this.prisma.session.updateMany({ where: { userId: user.id, id: { not: user.sessionId }, isRevoked: false }, data: { isRevoked: true } });
    await this.audit.write(user, 'OTHER_SESSIONS_REVOKED', 'Session', user.id, null, { count: result.count });
    return { revoked: result.count };
  }

  trustedDevices(user: AuthUser) {
    return this.prisma.device.findMany({
      where: { userId: user.id, trusted: { isNot: null } },
      include: { trusted: true },
      orderBy: { firstSeenAt: 'desc' },
    });
  }

  async revokeTrustedDevice(user: AuthUser, deviceId: string) {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device || device.userId !== user.id) throw new AppError(ERROR_CODES.PERMISSION_DENIED, 'Device not found', HttpStatus.NOT_FOUND);
    await this.prisma.trustedDevice.deleteMany({ where: { deviceId } });
    await this.prisma.session.updateMany({ where: { deviceId }, data: { isRevoked: true } });
    await this.audit.write(user, 'TRUSTED_DEVICE_REVOKED', 'Device', deviceId);
    return { revoked: true };
  }

  loginAttempts(user: AuthUser) {
    return this.prisma.loginAttempt.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  passkeys(user: AuthUser) {
    return this.prisma.passkey.findMany({
      where: { userId: user.id },
      select: { id: true, credentialId: true, label: true, deviceInfo: true, counter: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async beginPasskeyRegistration(user: AuthUser) {
    const rpID = process.env.WEBAUTHN_RP_ID ?? 'localhost';
    const options = await generateRegistrationOptions({
      rpName: process.env.WEBAUTHN_RP_NAME ?? 'ERP POS',
      rpID,
      userID: Buffer.from(user.id),
      userName: user.email,
      userDisplayName: user.fullName,
      attestationType: 'none',
      excludeCredentials: (await this.prisma.passkey.findMany({ where: { userId: user.id }, select: { credentialId: true } })).map((passkey) => ({ id: passkey.credentialId })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    });
    await this.redis.setJson(`webauthn:register:${user.id}`, options.challenge, 300);
    return options;
  }

  async finishPasskeyRegistration(user: AuthUser, response: RegistrationResponseJSON, label?: string, deviceInfo?: string) {
    const challenge = await this.redis.getJson<string>(`webauthn:register:${user.id}`);
    if (!challenge) throw new AppError(ERROR_CODES.AUTH_SESSION_EXPIRED, 'WebAuthn registration expired', HttpStatus.UNAUTHORIZED);
    await this.redis.delete(`webauthn:register:${user.id}`);
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:3000',
      expectedRPID: process.env.WEBAUTHN_RP_ID ?? 'localhost',
      requireUserVerification: true,
    });
    if (!verification.verified) throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'WebAuthn registration failed', HttpStatus.UNAUTHORIZED);
    const credential = verification.registrationInfo.credential;
    const passkey = await this.prisma.passkey.create({
      data: {
        userId: user.id,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        label: label ?? 'Passkey',
        deviceInfo,
      },
      select: { id: true, credentialId: true, label: true, deviceInfo: true, counter: true, createdAt: true },
    });
    await this.audit.write(user, 'PASSKEY_REGISTERED', 'Passkey', passkey.id);
    return passkey;
  }

  async beginPasskeyAuthentication(email?: string) {
    const user = email ? await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } }) : null;
    const credentials = user ? await this.prisma.passkey.findMany({ where: { userId: user.id }, select: { credentialId: true } }) : [];
    const options = await generateAuthenticationOptions({
      rpID: process.env.WEBAUTHN_RP_ID ?? 'localhost',
      userVerification: 'required',
      allowCredentials: credentials.map((credential) => ({ id: credential.credentialId })),
    });
    await this.redis.setJson(`webauthn:authenticate:${options.challenge}`, user?.id ?? null, 300);
    return options;
  }

  async finishPasskeyAuthentication(response: AuthenticationResponseJSON) {
    const challenge = this.extractChallenge(response.response.clientDataJSON);
    const requestedUserId = await this.redis.getJson<string | null>(`webauthn:authenticate:${challenge}`);
    await this.redis.delete(`webauthn:authenticate:${challenge}`);
    const passkey = await this.prisma.passkey.findUnique({ where: { credentialId: response.id } });
    const userId = requestedUserId ?? passkey?.userId;
    if (!passkey || !userId || passkey.userId !== userId) throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Passkey not recognized', HttpStatus.UNAUTHORIZED);
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:3000',
      expectedRPID: process.env.WEBAUTHN_RP_ID ?? 'localhost',
      credential: {
        id: passkey.credentialId,
        publicKey: Buffer.from(passkey.publicKey, 'base64url'),
        counter: passkey.counter,
      },
      requireUserVerification: true,
    });
    if (!verification.verified || verification.authenticationInfo.newCounter <= passkey.counter) {
      throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Invalid or replayed passkey', HttpStatus.UNAUTHORIZED);
    }
    await this.prisma.passkey.update({ where: { id: passkey.id }, data: { counter: verification.authenticationInfo.newCounter } });
    return { userId };
  }

  private extractChallenge(clientDataJSON: string) {
    const clientData = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8')) as { challenge?: string };
    if (!clientData.challenge) throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Missing WebAuthn challenge', HttpStatus.UNAUTHORIZED);
    return clientData.challenge;
  }

  async revokePasskey(user: AuthUser, passkeyId: string) {
    const passkey = await this.prisma.passkey.findUnique({ where: { id: passkeyId } });
    if (!passkey || passkey.userId !== user.id) throw new AppError(ERROR_CODES.PERMISSION_DENIED, 'Passkey not found', HttpStatus.NOT_FOUND);
    await this.prisma.passkey.delete({ where: { id: passkeyId } });
    await this.audit.write(user, 'PASSKEY_REVOKED', 'Passkey', passkeyId);
    return { revoked: true };
  }

  async renamePasskey(user: AuthUser, passkeyId: string, label: string) {
    const passkey = await this.prisma.passkey.findUnique({ where: { id: passkeyId } });
    if (!passkey || passkey.userId !== user.id) throw new AppError(ERROR_CODES.PERMISSION_DENIED, 'Passkey not found', HttpStatus.NOT_FOUND);
    const updated = await this.prisma.passkey.update({ where: { id: passkeyId }, data: { label } });
    await this.audit.write(user, 'PASSKEY_RENAMED', 'Passkey', passkeyId, { label: passkey.label ?? null }, { label });
    return updated;
  }

  async adminResetTwoFactor(actor: AuthUser, userId: string) {
    await this.prisma.twoFactorCredential.updateMany({ where: { userId }, data: { isEnabled: false, enabledAt: null } });
    await this.prisma.backupCode.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.write(actor, 'ADMIN_RESET_TWO_FACTOR', 'User', userId);
    return { reset: true };
  }

  async regenerateBackupCodes(user: AuthUser) {
    const plain: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.backupCode.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      for (let i = 0; i < 10; i++) {
        const code = randomBytes(5).toString('hex');
        plain.push(code);
        await tx.backupCode.create({
          data: {
            userId: user.id,
            codeHash: await argon2.hash(code, { type: argon2.argon2id }),
          },
        });
      }
    });
    await this.audit.write(user, 'BACKUP_CODES_REGENERATE', 'BackupCode', user.id);
    return { codes: plain };
  }

  async redeemBackupCode(userId: string, code: string) {
    const rows = await this.prisma.backupCode.findMany({
      where: { userId, usedAt: null, revokedAt: null },
    });
    for (const row of rows) {
      if (await argon2.verify(row.codeHash, code)) {
        await this.prisma.backupCode.update({
          where: { id: row.id },
          data: { usedAt: new Date() },
        });
        return { redeemed: true, id: row.id };
      }
    }
    throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Invalid backup code', HttpStatus.UNAUTHORIZED);
  }

  async consumeBackupCode(userId: string, code?: string) {
    if (!code) return false;
    try {
      await this.redeemBackupCode(userId, code);
      return true;
    } catch {
      return false;
    }
  }

  private encryptionKey() {
    return createHash('sha256')
      .update(process.env.JWT_ACCESS_SECRET ?? 'change-me-access-secret-min-32-chars')
      .digest();
  }

  private encryptSecret(secret: string) {
    const iv = secureRandomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
  }

  private decryptSecret(value: string) {
    const [ivValue, tagValue, encryptedValue] = value.split('.');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), Buffer.from(ivValue, 'base64'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64')), decipher.final()]).toString('utf8');
  }

  private generateTotpSecret() {
    return this.base32Encode(secureRandomBytes(20));
  }

  private totpUri(email: string, secret: string) {
    const issuer = process.env.TOTP_ISSUER ?? 'ERP POS';
    return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  }

  private verifyTotp(secret: string, code: string) {
    if (!/^\d{6}$/.test(code)) return false;
    const counter = Math.floor(Date.now() / 1000 / 30);
    return [-1, 0, 1].some((offset) => {
      const expected = this.totpCode(secret, counter + offset);
      return timingSafeEqual(Buffer.from(expected), Buffer.from(code));
    });
  }

  private totpCode(secret: string, counter: number) {
    const input = Buffer.alloc(8);
    input.writeBigInt64BE(BigInt(counter));
    const digest = createHmac('sha1', this.base32Decode(secret)).update(input).digest();
    const position = digest[digest.length - 1] & 0x0f;
    const binary = ((digest[position] & 0x7f) << 24) | (digest[position + 1] << 16) | (digest[position + 2] << 8) | digest[position + 3];
    return String(binary % 1_000_000).padStart(6, '0');
  }

  private base32Encode(value: Buffer) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let output = '';
    let buffer = 0;
    let bits = 0;
    for (const byte of value) {
      buffer = (buffer << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        output += alphabet[(buffer >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits) output += alphabet[(buffer << (5 - bits)) & 31];
    return output;
  }

  private base32Decode(value: string) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let buffer = 0;
    let bits = 0;
    const output: number[] = [];
    for (const character of value.replace(/=+$/, '').toUpperCase()) {
      const index = alphabet.indexOf(character);
      if (index < 0) throw new Error('Invalid TOTP secret');
      buffer = (buffer << 5) | index;
      bits += 5;
      if (bits >= 8) {
        output.push((buffer >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return Buffer.from(output);
  }
}
