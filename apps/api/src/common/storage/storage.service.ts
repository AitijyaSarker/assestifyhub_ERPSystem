import { Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { readFile, unlink } from 'fs/promises';
import { basename } from 'path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket = process.env.S3_BUCKET;
  private readonly client = process.env.S3_ENDPOINT && this.bucket
    ? new S3Client({
        region: process.env.S3_REGION ?? 'us-east-1',
        endpoint: process.env.S3_ENDPOINT,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
        credentials: process.env.S3_ACCESS_KEY ? { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY ?? '' } : undefined,
      })
    : null;

  async publish(localPath: string, publicPath: string, contentType: string) {
    if (!this.client || !this.bucket) return publicPath;
    const key = publicPath.replace(/^\//, '').replace(/^uploads\//, '');
    try {
      await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: await readFile(localPath), ContentType: contentType }));
    } catch (error) {
      if (process.env.NODE_ENV === 'production' && process.env.S3_REQUIRED === 'true') throw error;
      this.logger.warn(`Object storage unavailable; keeping local file for ${publicPath}`);
      return publicPath;
    }
    await unlink(localPath).catch(() => undefined);
    const publicBase = process.env.S3_PUBLIC_URL ?? process.env.S3_ENDPOINT;
    return `${publicBase?.replace(/\/$/, '')}/${this.bucket}/${key}`;
  }

  safeName(path: string) {
    return basename(path);
  }
}
