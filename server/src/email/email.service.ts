import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async sendVerificationEmail(to: string, code: string) {
    try {
      await this.mailerService.sendMail({
        to,
        subject: 'Your Deskina Verification Code',
        html: `
          <h1>Your Verification Code</h1>
          <p>Please use the following code to complete your registration:</p>
          <h2 style="font-size: 24px; letter-spacing: 2px; text-align: center;">${code}</h2>
          <p>This code will expire in a short time. If you did not request this, please ignore this email.</p>
        `,
      });
      this.logger.log(`Verification email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${to}`, error.stack);
      throw new Error('Could not send verification email.');
    }
  }
}
