import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { SessionService } from '../session/session.service';
import { ScriptsService } from '../scripts/scripts.service';
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
    private readonly scriptsService: ScriptsService,
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
    return `당신은 "Deskina" 라는 데스크톱 애플리케이션 내부에서 실행되는 AI 에이전트입니다. 사용자의 로컬 머신에서 작업을 실행하여 돕는 것이 당신의 목표입니다.

당신은 항상 JSON 형식으로만 응답해야 합니다. 당신의 모든 응답은 다음 JSON 스키마를 따라야 합니다:
{
  "action": "액션 이름",
  "parameters": { ... }
}

당신은 다음 액션을 사용할 수 있습니다:

1.  **reply**: 사용자에게 일반 텍스트 메시지를 보낼 때 사용합니다.
    - \`action\`: "reply"
    - \`parameters\`: { "content": "여기에 메시지를 입력하세요." }

2.  **runCommand**: 사용자의 운영 체제에서 셸 명령어를 실행할 때 사용합니다.
    - 사용자의 OS 정보(\`win32\`, \`darwin\` 등)가 주어집니다. 반드시 해당 OS와 호환되는 명령어를 생성해야 합니다. (예: 'win32'에서는 \`dir\`, 'darwin'에서는 \`ls\`)
    - 만약 명령어 실행에 실패하면, 동일한 명령을 다시 시도하지 마십시오. 대신, 오류를 보고하고 사용자에게 다음 행동을 물어보세요.
    - \`action\`: "runCommand"
    - \`parameters\`: { "command": "실행할 명령어" }

3.  **editFile**: 사용자의 로컬 파일 시스템에 있는 텍스트 파일을 수정할 때 사용합니다.
    - 기존 파일을 수정하기 위한 액션입니다. 신중하고 정확하게 사용하세요.
    - \`action\`: "editFile"
    - \`parameters\`: { "filePath": "전체 파일 경로", "newContent": "파일의 새로운 전체 내용" }
    - **중요**: \`newContent\` 파라미터는 변경된 부분만이 아니라, 수정 후 파일의 **전체 내용**을 포함해야 합니다.

4.  **createScript**: 사용자를 위해 Python 스크립트를 생성하고 저장합니다.
    - \`action\`: "createScript"
    - \`parameters\`: { "name": "스크립트의 고유한 이름 (예: 'my_calendar_script')", "description": "스크립트에 대한 간단한 설명", "code": "실행할 전체 Python 코드" }

5.  **listScripts**: 사용자가 이전에 생성한 모든 스크립트의 목록을 보여줍니다.
    - \`action\`: "listScripts"
    - \`parameters\`: {}

6.  **runScript**: 이전에 생성된 스크립트를 이름으로 실행합니다. 이 액션은 클라이언트에서 처리됩니다.
    - \`action\`: "runScript"
    - \`parameters\`: { "name": "실행할 스크립트의 이름" }


사용자가 무언가를 요청하면, 가장 적절한 액션을 선택하여 응답하세요.

모든 응답은 반드시 한국어로 해야 합니다. 현재 사용자의 OS는 ${platform} 입니다.`;
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
      if (message) promptParts.push({ text: message });
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
      const finalClientPayload = {
        action: parsedPayload.action || 'reply', // Default to 'reply' if no action
        parameters: parsedPayload.parameters || parsedPayload, // Use the whole payload as params if needed
      };
      
      // 4. Handle server-side actions OR pass client-side actions through
      const { action, parameters } = finalClientPayload;

      if (action === 'createScript') {
        const { name, description, code } = parameters;
        const filePath = `scripts/${name}.py`; // Define file path
        
        await this.scriptsService.create({
          userId,
          name,
          description,
          filePath,
          content: code,
        });

        yield { type: 'final', payload: {
          action: 'reply',
          parameters: { content: `✅ 스크립트 "${name}"을(를) 성공적으로 생성했습니다.`}
        }};
      } else if (action === 'listScripts') {
        const userScripts = await this.scriptsService.findAllForUser(userId);
        
        let content;
        if (userScripts.length === 0) {
          content = "생성된 스크립트가 없습니다. 새로 만들까요?";
        } else {
          const scriptList = userScripts.map(s => `- **${s.name}**: ${s.description || '설명 없음'}`).join('\n');
          content = `### 📝 내 스크립트 목록\n\n${scriptList}`;
        }

        yield { type: 'final', payload: {
          action: 'reply',
          parameters: { content }
        }};
      } else if (action === 'runScript') {
        const { name } = parameters;
        // Find the script by name for the current user
        const script = await (this.prisma as any).script.findUnique({
          where: { userId_name: { userId, name } },
        });

        if (!script) {
          yield { type: 'final', payload: {
            action: 'reply',
            parameters: { content: `❌ 스크립트 "${name}"을(를) 찾을 수 없습니다.`}
          }};
        } else {
          // Pass the enriched runScript action to the client, including all details
          yield { type: 'final', payload: {
            action: 'runScript',
            parameters: {
              id: script.id,
              name: script.name,
              filePath: script.filePath,
              content: script.content,
            }
          }};
        }
      } else {
        // For 'reply', 'editFile', 'runCommand', just pass it to the client
        yield { type: 'final', payload: finalClientPayload };
      }
    } catch (error) {
      this.logger.error(`Error in generateResponse for user ${userId} in session ${currentSessionId}:`, error.stack);
      
      let userFriendlyMessage = '🤖 AI 모델 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
      if (error.message?.includes('429') || error.message?.includes('API key not valid')) {
        userFriendlyMessage = '🤖 API 하루 사용량을 초과했습니다.';
      }
      
      // This is the correct, simple payload structure the client expects for rendering.
      const errorPayloadForClient = {
        action: 'reply',
        parameters: {
          content: userFriendlyMessage
        }
      };

      // Create the payload to be saved in the database, which is a stringified version of the client payload.
      const errorPayloadForDb = JSON.stringify(errorPayloadForClient);

      if (currentSessionId) {
        await this.prisma.conversation.create({
          data: {
            sessionId: currentSessionId,
            role: 'model',
            content: errorPayloadForDb,
          },
        });
      }

      // Yield the correctly structured error to the client as a final message.
      yield { type: 'final', payload: errorPayloadForClient };
    }
  }
}
