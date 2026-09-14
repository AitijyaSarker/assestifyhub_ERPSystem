import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly transporter = process.env.SMTP_HOST ? nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  }) : null;

  constructor(private readonly prisma: PrismaService) {}

  async notify(userId: string, type: NotificationType, title: string, message: string) {
    const preference = await this.prisma.notificationPreference.findUnique({ where: { userId_type: { userId, type } } });
    if (preference?.inAppEnabled !== false) {
      await this.prisma.notification.create({ data: { userId, type, title, message } });
    }
    if (preference?.emailEnabled && this.transporter) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (user) {
        try {
          await this.transporter.sendMail({ from: process.env.SMTP_FROM ?? process.env.SMTP_USER, to: user.email, subject: title, text: message });
        } catch (error) {
          this.logger.error(`Notification email failed for ${user.email}`, error instanceof Error ? error.stack : undefined);
        }
      }
    }
  }
}
