import { Injectable, ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email/email.service';
import { CreateAuthDto } from './dto/create-auth.dto';
import { RequestVerificationDto } from './dto/request-verification.dto';
import { CompleteSignupDto } from './dto/complete-signup.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
  ) {}

  async requestVerification(dto: RequestVerificationDto): Promise<{ message: string }> {
    const { email } = dto;
    const existingUser = await this.prisma.user.findUnique({ where: { email } });

    if (existingUser && existingUser.emailVerified) {
      throw new ConflictException('This email is already registered and verified.');
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedCode = await bcrypt.hash(verificationCode, 10); // Hash the code for security

    if (existingUser) {
      await this.prisma.user.update({
        where: { email },
        data: { verificationToken: hashedCode }, // Store the hashed code
      });
    } else {
      await this.prisma.user.create({
        data: { email, verificationToken: hashedCode },
      });
    }

    await this.emailService.sendVerificationEmail(email, verificationCode); // Send the plain code
    return { message: 'Verification code sent. Please check your email.' };
  }

  async completeSignup(dto: CompleteSignupDto): Promise<{ accessToken: string }> {
    const { email, code, password } = dto;

    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.verificationToken) {
      throw new BadRequestException('Verification process not started for this email.');
    }
    
    const isCodeValid = await bcrypt.compare(code, user.verificationToken);

    if (!isCodeValid) {
      throw new BadRequestException('Invalid verification code.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        emailVerified: true,
        verificationToken: null,
      },
    });

    const payload = { email: updatedUser.email, sub: updatedUser.id };
    const accessToken = this.jwtService.sign(payload);
    return { accessToken };
  }
  
  async login(loginDto: CreateAuthDto): Promise<{ accessToken: string }> {
    const { email, password } = loginDto;
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const payload = { email: user.email, sub: user.id };
    const accessToken = this.jwtService.sign(payload);
    return { accessToken };
  }
}
