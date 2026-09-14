import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export type TxClient = Prisma.TransactionClient;

@Injectable()
export class TransactionService {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { maxWait: 10_000, timeout: 30_000 });
  }
}
