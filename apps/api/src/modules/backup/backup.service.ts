import { HttpStatus, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { mkdir, readFile, stat } from 'fs/promises';
import { basename, join } from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { PrismaService } from '../../database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODES } from '@erp/shared-types';

const execFileAsync = promisify(execFile);

@Injectable()
export class BackupService implements OnModuleInit, OnModuleDestroy {
  private schedule?: NodeJS.Timeout;
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    const minutes = Number(process.env.BACKUP_SCHEDULE_MINUTES ?? 0);
    if (minutes > 0 && process.env.NODE_ENV !== 'test') {
      this.schedule = setInterval(() => this.runScheduled().catch(() => undefined), minutes * 60_000);
    }
  }

  onModuleDestroy() {
    if (this.schedule) clearInterval(this.schedule);
  }

  records() {
    return this.prisma.backupRecord.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }).then((rows) => rows.map((row) => ({ ...row, sizeBytes: row.sizeBytes.toString() })));
  }

  async retention() {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key: 'backup_retention_days' } });
    return { days: Number(setting?.value ?? process.env.BACKUP_RETENTION_DAYS ?? 30) };
  }

  async setRetention(user: AuthUser, days: number) {
    const row = await this.prisma.systemSetting.upsert({ where: { key: 'backup_retention_days' }, update: { value: days }, create: { key: 'backup_retention_days', value: days } });
    await this.audit.write(user, 'BACKUP_RETENTION_UPDATE', 'SystemSetting', row.key, null, { days });
    return { days };
  }

  async createDatabaseBackup(user: AuthUser | null, reason: string) {
    const directory = process.env.BACKUP_DIR ?? './backups';
    await mkdir(directory, { recursive: true });
    const filename = `erp-${new Date().toISOString().replace(/[:.]/g, '-')}-${basename(reason).replace(/[^a-zA-Z0-9_-]/g, '_')}.dump`;
    const filePath = join(directory, filename);
    let row = await this.prisma.backupRecord.create({ data: { fileUrl: filePath, sizeBytes: 0, status: 'PENDING' } });
    try {
      await execFileAsync(process.env.PG_DUMP_BIN ?? 'pg_dump', ['--format=custom', '--file', filePath, process.env.DATABASE_URL ?? '']);
      const file = await readFile(filePath);
      const details = await stat(filePath);
      row = await this.prisma.backupRecord.update({ where: { id: row.id }, data: { status: 'COMPLETED', sizeBytes: details.size, checksum: createHash('sha256').update(file).digest('hex') } });
      await this.applyRetention(directory);
      await this.audit.write(user, 'BACKUP_CREATE', 'BackupRecord', row.id, null, { reason, filename });
      return { ...row, sizeBytes: row.sizeBytes.toString() };
    } catch (error) {
      await this.prisma.backupRecord.update({ where: { id: row.id }, data: { status: 'FAILED' } });
      void error;
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Backup failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private async runScheduled() {
    await this.createDatabaseBackup(null, 'scheduled');
  }

  private async applyRetention(directory: string) {
    const configured = await this.prisma.systemSetting.findUnique({ where: { key: 'backup_retention_days' } });
    const days = Number(configured?.value ?? process.env.BACKUP_RETENTION_DAYS ?? 30);
    if (days <= 0) return;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const old = await this.prisma.backupRecord.findMany({ where: { createdAt: { lt: cutoff }, status: 'COMPLETED', fileUrl: { not: { startsWith: 'snapshot:' } } }, select: { id: true, fileUrl: true } });
    for (const record of old) {
      await import('fs/promises').then(({ unlink }) => unlink(record.fileUrl).catch(() => undefined));
      await this.prisma.backupRecord.delete({ where: { id: record.id } });
    }
  }

  async restoreDatabase(user: AuthUser, filename: string, confirmation: string) {
    if (process.env.ENABLE_RESTORE !== 'true') throw new AppError(ERROR_CODES.PERMISSION_DENIED, 'Restore is disabled by deployment policy', HttpStatus.FORBIDDEN);
    if (confirmation !== 'RESTORE DATABASE') throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Restore confirmation does not match');
    const directory = process.env.BACKUP_DIR ?? './backups';
    const safeName = basename(filename);
    const filePath = join(directory, safeName);
    await stat(filePath).catch(() => { throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Backup file not found', HttpStatus.NOT_FOUND); });
    const record = await this.prisma.backupRecord.findFirst({ where: { fileUrl: filePath, status: 'COMPLETED' } });
    if (!record?.checksum) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Backup checksum is unavailable', HttpStatus.CONFLICT);
    const checksum = createHash('sha256').update(await readFile(filePath)).digest('hex');
    if (checksum !== record.checksum) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Backup checksum verification failed', HttpStatus.CONFLICT);
    await execFileAsync(process.env.PG_RESTORE_BIN ?? 'pg_restore', ['--clean', '--if-exists', '--dbname', process.env.DATABASE_URL ?? '', filePath]);
    await this.audit.write(user, 'BACKUP_RESTORE', 'BackupRecord', safeName, null, { filename: safeName });
    return { restored: true, filename: safeName };
  }

  async download(filename: string) {
    const directory = process.env.BACKUP_DIR ?? './backups';
    const safeName = basename(filename);
    const filePath = join(directory, safeName);
    await stat(filePath).catch(() => { throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Backup file not found', HttpStatus.NOT_FOUND); });
    return { filePath, filename: safeName };
  }

  /** Logical safety snapshot used before destructive system operations. */
  async snapshot(user: AuthUser, reason: string) {
    const row = await this.prisma.backupRecord.create({
      data: {
        fileUrl: `snapshot:${reason}:${new Date().toISOString()}`,
        sizeBytes: BigInt(0),
        checksum: null,
        status: 'COMPLETED',
      },
    });
    await this.audit.write(user, 'BACKUP_SNAPSHOT', 'BackupRecord', row.id, null, { reason });
    return { ...row, sizeBytes: row.sizeBytes.toString() };
  }
}
