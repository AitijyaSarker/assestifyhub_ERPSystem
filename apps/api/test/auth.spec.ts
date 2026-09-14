import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, login, ensureRoles, createShopUser } from './helpers';

describe('Auth', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await ensureRoles(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects wrong password', async () => {
    const shop = await prisma.shop.create({
      data: { name: 'Auth Shop', code: `AUTH${Date.now()}`, invoicePrefix: 'AU', settings: { create: {} } },
    });
    const u = await createShopUser(prisma, `auth${Date.now()}@test.local`, shop.id, 'SHOP_USER');
    const res = await login(app, u.user.email, 'WrongPass999');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('rejects unauthorized API call', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/products');
    expect(res.status).toBe(401);
  });

  it('locks the account after repeated failed logins', async () => {
    const shop = await prisma.shop.create({
      data: { name: 'Lock Shop', code: `LCK${Date.now()}`, invoicePrefix: 'LK', settings: { create: {} } },
    });
    const u = await createShopUser(prisma, `lock${Date.now()}@test.local`, shop.id, 'SHOP_USER');
    for (let i = 0; i < 8; i++) {
      await login(app, u.user.email, 'WrongPass999');
    }
    const res = await login(app, u.user.email, u.password);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_ACCOUNT_LOCKED');
  });

  it('rejects a revoked session', async () => {
    const shop = await prisma.shop.create({
      data: { name: 'Rev Shop', code: `REV${Date.now()}`, invoicePrefix: 'RV', settings: { create: {} } },
    });
    const u = await createShopUser(prisma, `rev${Date.now()}@test.local`, shop.id, 'SHOP_USER');
    const logged = await login(app, u.user.email, u.password);
    const token = logged.body.data.accessToken as string;
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Authorization', `Bearer ${token}`);
    const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe('AUTH_SESSION_REVOKED');
  });

  it('rejects an expired session', async () => {
    const shop = await prisma.shop.create({
      data: { name: 'Exp Shop', code: `EXP${Date.now()}`, invoicePrefix: 'EX', settings: { create: {} } },
    });
    const u = await createShopUser(prisma, `exp${Date.now()}@test.local`, shop.id, 'SHOP_USER');
    const logged = await login(app, u.user.email, u.password);
    const token = logged.body.data.accessToken as string;
    const sessions = await prisma.session.findMany({ where: { userId: u.user.id } });
    await prisma.session.update({
      where: { id: sessions[0].id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe('AUTH_SESSION_EXPIRED');
  });

  it('blocks a shop user from an admin endpoint', async () => {
    const shop = await prisma.shop.create({
      data: { name: 'Adm Shop', code: `ADM${Date.now()}`, invoicePrefix: 'AD', settings: { create: {} } },
    });
    const u = await createShopUser(prisma, `su${Date.now()}@test.local`, shop.id, 'SHOP_USER');
    const token = (await login(app, u.user.email, u.password)).body.data.accessToken as string;
    const res = await request(app.getHttpServer()).get('/api/v1/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('regenerates backup codes as revoked (not deleted) and marks redeemed codes used', async () => {
    const shop = await prisma.shop.create({
      data: { name: 'Bc Shop', code: `BC${Date.now()}`, invoicePrefix: 'BC', settings: { create: {} } },
    });
    const admin = await createShopUser(prisma, `bc${Date.now()}@test.local`, shop.id, 'SUPER_ADMIN');
    const token = (await login(app, admin.user.email, admin.password)).body.data.accessToken as string;
    const first = await request(app.getHttpServer())
      .post('/api/v1/security/backup-codes/regenerate')
      .set('Authorization', `Bearer ${token}`);
    expect([200, 201]).toContain(first.status);
    const code = first.body.data.codes[0] as string;
    const second = await request(app.getHttpServer())
      .post('/api/v1/security/backup-codes/regenerate')
      .set('Authorization', `Bearer ${token}`);
    expect([200, 201]).toContain(second.status);
    const revoked = await prisma.backupCode.findMany({
      where: { userId: admin.user.id, revokedAt: { not: null } },
    });
    expect(revoked.length).toBe(10);
    const stillThere = await prisma.backupCode.count({ where: { userId: admin.user.id } });
    expect(stillThere).toBe(20);
    const redeemOld = await request(app.getHttpServer())
      .post('/api/v1/security/backup-codes/redeem')
      .set('Authorization', `Bearer ${token}`)
      .send({ code });
    expect(redeemOld.status).toBe(401);
    const newCode = second.body.data.codes[0] as string;
    const redeem = await request(app.getHttpServer())
      .post('/api/v1/security/backup-codes/redeem')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: newCode });
    expect([200, 201]).toContain(redeem.status);
    const used = await prisma.backupCode.findFirst({ where: { userId: admin.user.id, usedAt: { not: null } } });
    expect(used).toBeTruthy();
    const audit = await prisma.auditLog.findFirst({
      where: { actorId: admin.user.id, action: 'BACKUP_CODES_REGENERATE' },
    });
    expect(audit?.actorRole).toBe('SUPER_ADMIN');
  });
});
