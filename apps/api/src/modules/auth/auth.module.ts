import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { RedisModule } from '../../common/redis/redis.module';
import { SecurityModule } from '../security/security.module';
import type { StringValue } from 'ms';

@Global()
@Module({
  imports: [
    RedisModule,
    SecurityModule,
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: process.env.JWT_ACCESS_SECRET ?? 'change-me-access-secret-min-32-chars',
        signOptions: { expiresIn: (process.env.JWT_ACCESS_EXPIRES ?? '15m') as StringValue },
      }),
    }),
  ],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
