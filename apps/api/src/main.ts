import { mkdirSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  mkdirSync('./uploads/returns', { recursive: true });
  const app = await NestFactory.create(AppModule, { rawBody: false });
  const origin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';

  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api/v1');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: origin.split(',').map((o) => o.trim()),
    credentials: true,
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
