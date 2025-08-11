import { IsOptional, IsString } from 'class-validator';

export class ConversationStreamDto {
  sessionId?: string;
  message?: string;
  platform?: string;
  imageBase64?: string;
  currentWorkingDirectory?: string;
  tool_responses?: { name: string; result: any }[];
} 