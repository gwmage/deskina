import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class CompleteSignupDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'Verification code must be 6 digits.' })
  code: string;

  @IsString()
  @IsNotEmpty()
  @Length(8, 100, { message: 'Password must be between 8 and 100 characters long.' })
  password: string;
} 