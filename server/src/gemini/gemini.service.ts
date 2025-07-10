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
    let session = null;

    // The user was right. The frontend sends a temporary ID for new chats.
    // We must first verify if the session exists in the database.
    if (currentSessionId) {
      session = await (this.prisma as any).session.findUnique({
        where: { id: currentSessionId, userId: userId },
      });
    }

    // If the session does not exist (ID was temporary/fake/null), create a new one.
    // This is the correct logic that was missing.
    if (!session) {
      const newSession = await this.sessionService.create(
        message.substring(0, 30),
        userId,
      );
      currentSessionId = newSession.id;
      // Send the *real* session ID back to the client.
      yield { type: 'session_id', payload: currentSessionId };
    }

    try {
      const systemPrompt = this.getSystemPrompt(platform);
      const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        // ... more safety settings
      ];

      // Now `currentSessionId` is guaranteed to be valid.
      // We use `sessionId` directly to bypass the incorrect type inferences.
      await (this.prisma as any).conversation.create({
        data: {
          sessionId: currentSessionId,
          role: 'user',
          content: message,
          imageBase64: imageBase64,
        },
      });

      // Fetch history using the now-guaranteed-valid sessionId.
      const history: any[] = await (this.prisma as any).conversation.findMany({
        where: { sessionId: currentSessionId },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });

      const chatHistory = history.map((conv) => {
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
      
      // 1. Save the raw JSON string from the model to the database.
      await (this.prisma as any).conversation.create({
        data: {
          sessionId: currentSessionId,
          role: 'model',
          content: rawResponseText, // The raw JSON string
        },
      });

      // 2. Parse the response to be sent to the client.
      const parsedPayload = JSON.parse(rawResponseText);

      // 3. Restore the original, consistent message structure for the client.
      // This ensures the client's rendering logic works as it did before.
      const finalClientPayload = {
        action: parsedPayload.action || 'reply', // Default to 'reply' if no action
        parameters: parsedPayload.parameters || parsedPayload, // Use the whole payload as params if needed
      };

      yield { type: 'final', payload: finalClientPayload };

    } catch (error) {
      this.logger.error('Error in generateResponse:', error.stack);

      let userFriendlyMessage = 'AI 모델 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';

      if (error.message && (error.message.includes('429') || error.message.toLowerCase().includes('quota'))) {
        userFriendlyMessage = 'API 하루 사용량을 초과했습니다. 내일 다시 시도하시거나 플랜을 확인해주세요.';
      }
      
      if (currentSessionId) {
        // Save error message to the database
        const errorContent = {
          action: 'reply',
          parameters: {
            content: [{ type: 'text', value: `🤖 ${userFriendlyMessage}` }],
          },
        };

        await (this.prisma as any).conversation.create({
          data: {
            sessionId: currentSessionId,
            role: 'model',
            content: JSON.stringify(errorContent),
          },
        });
      }

      yield { type: 'error', payload: { message: userFriendlyMessage } };
    }
  }
}
