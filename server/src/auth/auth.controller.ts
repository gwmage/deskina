import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateAuthDto } from './dto/create-auth.dto';
import { RequestVerificationDto } from './dto/request-verification.dto';
import { CompleteSignupDto } from './dto/complete-signup.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('request-verification')
  @HttpCode(HttpStatus.OK)
  requestVerification(@Body() dto: RequestVerificationDto) {
    return this.authService.requestVerification(dto);
  }

  @Post('complete-signup')
  @HttpCode(HttpStatus.CREATED)
  completeSignup(@Body() dto: CompleteSignupDto) {
    return this.authService.completeSignup(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() loginDto: CreateAuthDto) {
    return this.authService.login(loginDto);
  }
}
