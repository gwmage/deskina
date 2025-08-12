import { IsArray, IsOptional, IsString } from 'class-validator';

export class ConversationStreamDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  imageBase64?: string;

  @IsOptional()
  @IsString()
  currentWorkingDirectory?: string;

  @IsOptional()
  @IsArray()
  tool_responses?: { name: string; result: any }[];

  @IsOptional()
  @IsArray()
  functionCalls?: any[]; // Simplified for now, can be more specific later
} 