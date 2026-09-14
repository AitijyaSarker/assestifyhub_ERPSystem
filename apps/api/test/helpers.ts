import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

export async function createTestApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma };
}

export async function login(app: INestApplication, email: string, password: string) {
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });
  return res;
}

export async function ensureRoles(prisma: PrismaService) {
  await prisma.permission.upsert({
    where: { key: 'sales.view.own_shop' },
    update: {},
    create: { key: 'sales.view.own_shop', module: 'sales' },
  });
  const keys = [
    'sales.create',
    'sales.view',
    'sales.view.own_shop',
    'inventory.view',
    'inventory.adjust',
    'returns.create',
    'returns.approve',
    'refunds.process',
    'customers.manage',
    'notifications.manage',
    'products.view',
    'products.create',
    'purchases.create',
    'purchases.view',
    'inventory.add',
    'returns.view',
    'returns.reject',
    'exchanges.process',
    'reports.view',
    'security.manage',
    'audit.view',
    'backup.manage',
    'users.manage',
    'shops.manage',
    'settings.manage',
    'products.update',
    'products.archive',
    'inventory.transfer.request',
    'inventory.transfer.approve',
    'inventory.transfer.dispatch',
    'inventory.transfer.receive',
  ];
  for (const key of keys) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, module: key.split('.')[0] },
    });
  }
  const all = await prisma.permission.findMany();
  const sa = await prisma.role.upsert({
    where: { name: 'SUPER_ADMIN' },
    update: {},
    create: { name: 'SUPER_ADMIN' },
  });
  const su = await prisma.role.upsert({
    where: { name: 'SHOP_USER' },
    update: {},
    create: { name: 'SHOP_USER' },
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: sa.id } });
  await prisma.rolePermission.createMany({ data: all.map((p) => ({ roleId: sa.id, permissionId: p.id })) });
  const shopKeys = new Set(['sales.create', 'sales.view.own_shop', 'inventory.view', 'returns.create', 'customers.manage', 'notifications.manage']);
  const shopPerms = all.filter((p) => shopKeys.has(p.key));
  await prisma.rolePermission.deleteMany({ where: { roleId: su.id } });
  await prisma.rolePermission.createMany({ data: shopPerms.map((p) => ({ roleId: su.id, permissionId: p.id })) });
  return { sa, su };
}

export async function createShopUser(prisma: PrismaService, email: string, shopId: string, roleName: 'SHOP_USER' | 'SUPER_ADMIN', password = 'Password123!') {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      fullName: email,
      userRoles: { create: { roleId: role.id } },
      userShops: { create: { shopId, isPrimary: true } },
    },
  });
  return { user, password };
}
