import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { SessionService } from '../session/session.service';
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  Part,
} from '@google/generative-ai';

@Injectable()
export class GeminiService implements OnModuleInit {
  private readonly logger = new Logger(GeminiService.name);
  private genAI: GoogleGenerativeAI;
  private model;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
  ) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  private getSystemPrompt(platform: string): string {
    return `You are "Deskina", an AI agent...`; // Abridged for brevity
  }

  private convertBase64ToPart(base64: string, mimeType: string): Part {
    return {
      inlineData: {
        data: base64,
        mimeType,
      },
    };
  }

  async *generateResponse(
    userId: string,
    message: string,
    platform: string,
    sessionId: string | null,
    imageBase64?: string,
  ) {
    let currentSessionId = sessionId;

    try {
      const systemPrompt = this.getSystemPrompt(platform);
      const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        // ... more safety settings
      ];

      if (!currentSessionId) {
        const newSession = await this.sessionService.create(message.substring(0, 30), userId);
        currentSessionId = newSession.id;
        yield { type: 'session_id', payload: currentSessionId };
      }

      await this.prisma.conversation.create({
        data: {
          sessionId: currentSessionId,
          role: 'user',
          content: message,
          imageBase64: imageBase64,
        } as any,
      });

      const history = await this.prisma.conversation.findMany({
        where: { sessionId: currentSessionId },
        orderBy: { createdAt: 'asc' },
        take: 20,
      } as any);

      const chatHistory = history.map((conv: any) => {
        const parts: Part[] = [];
        if (conv.content) parts.push({ text: conv.content });
        if (conv.role === 'user' && conv.imageBase64) {
          parts.push(this.convertBase64ToPart(conv.imageBase64, 'image/png'));
        }
        return {
          role: conv.role === 'model' ? 'model' : 'user',
          parts: parts.filter(Boolean),
        };
      }).filter(h => h.parts.length > 0);

      const chat = this.model.startChat({
        history: chatHistory,
        generationConfig: { maxOutputTokens: 2000, responseMimeType: 'application/json' },
        safetySettings,
      });
      
      const promptParts: Part[] = [{ text: systemPrompt }];
      if (message) promptParts.push({ text: `OS: ${platform}\n\n${message}` });
      if (imageBase64) {
        promptParts.push(this.convertBase64ToPart(imageBase64, 'image/png'));
      }

      const result = await chat.sendMessageStream(promptParts);

      let rawResponseText = '';
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        rawResponseText += chunkText;
        yield { type: 'text_chunk', payload: chunkText };
      }
      
      await this.prisma.conversation.create({
        data: { sessionId: currentSessionId, role: 'model', content: rawResponseText } as any,
      });

      const finalPayload = JSON.parse(rawResponseText);
      yield { type: 'final', payload: finalPayload };

    } catch (error) {
      this.logger.error('Error in generateResponse:', error.stack);

      let userFriendlyMessage = 'AI 모델 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';

      if (error.message && (error.message.includes('429') || error.message.toLowerCase().includes('quota'))) {
        userFriendlyMessage = 'API 하루 사용량을 초과했습니다. 내일 다시 시도하시거나 플랜을 확인해주세요.';
      }
      
      if (currentSessionId) {
        // Create the standard reply format for the error message
        const errorContent = {
          action: 'reply',
          parameters: {
            content: [{ type: 'text', value: `🤖 ${userFriendlyMessage}` }]
          }
        };

        await this.prisma.conversation.create({
          data: {
            sessionId: currentSessionId,
            role: 'model',
            // Store the structured error message as a JSON string
            content: JSON.stringify(errorContent),
          } as any,
        });
      }

      yield { type: 'error', payload: { message: userFriendlyMessage } };
    }
  }
}
