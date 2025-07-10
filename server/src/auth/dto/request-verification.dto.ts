import { IsEmail, IsNotEmpty } from 'class-validator';

export class RequestVerificationDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
} 