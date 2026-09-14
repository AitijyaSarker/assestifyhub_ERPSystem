import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppError } from '../errors/app-error';
import { HttpStatus } from '@nestjs/common';
import { ERROR_CODES } from '@erp/shared-types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      throw new AppError(ERROR_CODES.AUTH_SESSION_EXPIRED, 'Missing access token', HttpStatus.UNAUTHORIZED);
    }
    try {
      const payload = this.jwt.verify(token);
      (req as Request & { jwtPayload: unknown }).jwtPayload = payload;
      return true;
    } catch {
      throw new AppError(ERROR_CODES.AUTH_SESSION_EXPIRED, 'Invalid or expired access token', HttpStatus.UNAUTHORIZED);
    }
  }
}
