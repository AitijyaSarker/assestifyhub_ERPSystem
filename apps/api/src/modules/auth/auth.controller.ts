import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { SecurityService } from '../security/security.service';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly security: SecurityService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(dto, req.ip, req.headers['user-agent'], res);
  }

  @Public()
  @Post('refresh')
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.refresh(req.cookies?.refresh_token as string | undefined, res);
  }

  @Public()
  @Post('passkey/options')
  passkeyOptions(@Body() body: { email?: string }) {
    return this.security.beginPasskeyAuthentication(body.email);
  }

  @Public()
  @Post('passkey/verify')
  passkeyVerify(@Body() body: { response: AuthenticationResponseJSON; deviceFingerprint?: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.security.finishPasskeyAuthentication(body.response).then(({ userId }) => this.auth.passkeyLogin(userId, req.ip, req.headers['user-agent'], res, body.deviceFingerprint));
  }

  @Post('logout')
  logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(user.sessionId, res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
