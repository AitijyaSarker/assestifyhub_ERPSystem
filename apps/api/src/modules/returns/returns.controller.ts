import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { ReturnsService } from './returns.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ShopScoped } from '../../common/decorators/shop-scoped.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { CreateReturnDto, DecideReturnDto, ProcessRefundDto } from './dto/return.dto';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODES } from '@erp/shared-types';
import { HttpStatus } from '@nestjs/common';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Controller('returns')
@ShopScoped()
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @RequirePermissions('returns.view', 'returns.create')
  list(@CurrentUser() user: AuthUser, @Query('shopId') shopId?: string, @Query('search') search?: string) {
    return this.returns.list(user, shopId, search);
  }

  @Post()
  @RequirePermissions('returns.create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReturnDto) {
    return this.returns.create(user, dto);
  }

  @Post(':id/decide')
  @RequirePermissions('returns.approve', 'returns.reject')
  decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideReturnDto) {
    return this.returns.decide(user, id, dto);
  }

  @Post(':id/refund')
  @RequirePermissions('refunds.process')
  refund(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ProcessRefundDto) {
    return this.returns.refund(user, id, dto);
  }

  @Post(':id/evidence')
  @RequirePermissions('returns.create')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/returns',
        filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED.has(file.mimetype)) {
          return cb(
            new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid file type', HttpStatus.BAD_REQUEST),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  evidence(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'File required');
    return this.returns.attachEvidence(user, id, file.filename);
  }
}
