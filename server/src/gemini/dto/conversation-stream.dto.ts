import { IsOptional, IsString } from 'class-validator';

export class ConversationStreamDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  imageBase64?: string;
} 