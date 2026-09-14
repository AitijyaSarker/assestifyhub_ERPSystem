import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsString, Matches, MinLength } from 'class-validator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { SecurityService } from './security.service';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';

class RedeemBackupCodeDto {
  @IsString()
  @MinLength(6)
  code!: string;
}

class TwoFactorCodeDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

class LabelDto {
  @IsString()
  @MinLength(1)
  label!: string;
}

@Controller('security')
export class SecurityController {
  constructor(private readonly security: SecurityService) {}

  @Get('events')
  @RequirePermissions('security.manage')
  events() {
    return this.security.events();
  }

  @Post('2fa/setup')
  setupTwoFactor(@CurrentUser() user: AuthUser) {
    return this.security.beginTwoFactorSetup(user);
  }

  @Get('2fa/status')
  twoFactorStatus(@CurrentUser() user: AuthUser) {
    return this.security.twoFactorStatus(user);
  }

  @Post('2fa/confirm')
  confirmTwoFactor(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorCodeDto) {
    return this.security.confirmTwoFactor(user, dto.code);
  }

  @Post('2fa/disable')
  disableTwoFactor(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorCodeDto) {
    return this.security.disableTwoFactor(user, dto.code);
  }

  @Get('sessions')
  @RequirePermissions('security.manage')
  sessions(@CurrentUser() user: AuthUser) {
    return this.security.sessions(user);
  }

  @Get('device-requests')
  @RequirePermissions('security.manage')
  deviceRequests(@CurrentUser() user: AuthUser) {
    return this.security.deviceRequests(user);
  }

  @Post('device-requests/:id/approve')
  @RequirePermissions('security.manage')
  approveDevice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.security.approveDevice(user, id);
  }

  @Post('device-requests/:id/reject')
  @RequirePermissions('security.manage')
  rejectDevice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.security.rejectDevice(user, id);
  }

  @Post('sessions/:id/revoke')
  @RequirePermissions('security.manage')
  revokeSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.security.revokeSession(user, id);
  }

  @Post('sessions/revoke-others')
  revokeOtherSessions(@CurrentUser() user: AuthUser) {
    return this.security.revokeOtherSessions(user);
  }

  @Get('trusted-devices')
  trustedDevices(@CurrentUser() user: AuthUser) {
    return this.security.trustedDevices(user);
  }

  @Post('trusted-devices/:id/revoke')
  revokeTrustedDevice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.security.revokeTrustedDevice(user, id);
  }

  @Get('login-attempts')
  loginAttempts(@CurrentUser() user: AuthUser) {
    return this.security.loginAttempts(user);
  }

  @Get('passkeys')
  passkeys(@CurrentUser() user: AuthUser) {
    return this.security.passkeys(user);
  }

  @Post('passkeys/registration/options')
  registrationOptions(@CurrentUser() user: AuthUser) {
    return this.security.beginPasskeyRegistration(user);
  }

  @Post('passkeys/registration/verify')
  registrationVerify(@CurrentUser() user: AuthUser, @Body() body: { response: RegistrationResponseJSON; label?: string; deviceInfo?: string }) {
    return this.security.finishPasskeyRegistration(user, body.response, body.label, body.deviceInfo);
  }


  @Post('passkeys/:id/revoke')
  revokePasskey(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.security.revokePasskey(user, id);
  }

  @Post('passkeys/:id/rename')
  renamePasskey(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LabelDto) {
    return this.security.renamePasskey(user, id, dto.label);
  }

  @Post('users/:id/reset-2fa')
  @RequirePermissions('users.manage')
  resetUserTwoFactor(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.security.adminResetTwoFactor(user, id);
  }

  @Post('backup-codes/regenerate')
  @RequirePermissions('security.manage')
  regenerate(@CurrentUser() user: AuthUser) {
    return this.security.regenerateBackupCodes(user);
  }

  @Post('backup-codes/redeem')
  @RequirePermissions('security.manage')
  redeem(@CurrentUser() user: AuthUser, @Body() dto: RedeemBackupCodeDto) {
    return this.security.redeemBackupCode(user.id, dto.code);
  }
}
