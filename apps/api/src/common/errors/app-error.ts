import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@erp/shared-types';

export class AppError extends HttpException {
  constructor(code: ErrorCode, message: string, status: HttpStatus = HttpStatus.BAD_REQUEST) {
    super({ success: false, message, error: { code } }, status);
  }
}
