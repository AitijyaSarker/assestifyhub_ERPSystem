import { mkdirSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { NextFunction, Request, Response, static as expressStatic } from 'express';
import { randomBytes } from 'crypto';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  mkdirSync('./uploads/returns', { recursive: true });
  mkdirSync('./uploads/products', { recursive: true });
  const app = await NestFactory.create(AppModule, { rawBody: false });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-csrf-token, X-Requested-With, Accept');
    }
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api/v1');
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use('/uploads', expressStatic(join(process.cwd(), 'uploads')));
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    const csrfCookie = req.cookies?.csrf_token as string | undefined;
    const token = csrfCookie ?? randomBytes(24).toString('hex');
    if (!csrfCookie) {
      res.cookie('csrf_token', token, {
        httpOnly: false,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      });
    }
    const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const publicAuth = req.path === '/api/v1/auth/login' || req.path === '/api/v1/auth/refresh' || req.path.startsWith('/api/v1/auth/passkey');
    const bearer = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ');
    if (mutating && !publicAuth && !bearer && req.headers['x-csrf-token'] !== token) {
      return res.status(403).json({ success: false, message: 'CSRF token validation failed', error: { code: 'VALIDATION_ERROR' } });
    }
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  const swagger = new DocumentBuilder()
    .setTitle('ERP POS API')
    .setDescription('Multi-store retail ERP & POS')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
}

bootstrap();
