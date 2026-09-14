import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { basename } from 'path';
import { IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { BackupService } from './backup.service';

class SnapshotDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}

class RestoreDto {
  @IsString()
  filename!: string;

  @IsString()
  confirmation!: string;
}

@Controller('backup')
export class BackupController {
  constructor(private readonly backups: BackupService) {}

  @Get('records')
  @RequirePermissions('backup.manage')
  records() {
    return this.backups.records();
  }

  @Post('snapshot')
  @RequirePermissions('backup.manage')
  snapshot(@CurrentUser() user: AuthUser, @Body() dto: SnapshotDto) {
    return this.backups.snapshot(user, dto.reason);
  }

  @Post('database')
  @RequirePermissions('backup.manage')
  database(@CurrentUser() user: AuthUser, @Body() dto: SnapshotDto) {
    return this.backups.createDatabaseBackup(user, dto.reason);
  }

  @Post('restore')
  @RequirePermissions('backup.manage')
  restore(@CurrentUser() user: AuthUser, @Body() dto: RestoreDto) {
    return this.backups.restoreDatabase(user, dto.filename, dto.confirmation);
  }

  @Get('download')
  @RequirePermissions('backup.manage')
  async download(@Query('filename') filename: string, @Res() response: Response) {
    const result = await this.backups.download(basename(filename ?? ''));
    return response.download(result.filePath, result.filename);
  }
}
