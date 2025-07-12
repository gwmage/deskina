import { Injectable, Logger } from '@nestjs/common';
import { Part } from '@google/generative-ai';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  constructor(private prisma: PrismaService) {}

  async create(title: string, userId: string) {
    return this.prisma.session.create({
      data: {
        title,
        userId,
      },
    });
  }

  async findById(sessionId: string) {
    return this.prisma.session.findUnique({
      where: { id: sessionId },
    });
  }

  async findAllForUser(userId: string) {
    return this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addConversation(
    sessionId: string,
    role: 'user' | 'model' | 'tool',
    content: string,
    imageBase64?: string | null,
  ) {
    return this.prisma.conversation.create({
      data: {
        sessionId,
        role,
        content,
        imageBase64,
      },
    });
  }

  async getConversationsForClient(
    sessionId: string,
    limit = 20,
    skip = 0,
  ) {
    const history = await this.prisma.conversation.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' }, // 'desc' 순서 유지
      take: limit,
      skip: skip,
    });

    const clientHistory = [];
    const processedIndices = new Set<number>();

    for (let i = 0; i < history.length; i++) {
      if (processedIndices.has(i)) {
        continue;
      }

      const turn = history[i];

      if (
        turn.role === 'tool' &&
        i + 1 < history.length &&
        history[i + 1].role === 'model'
      ) {
        const toolTurn = turn;
        const modelTurn = history[i + 1];

        try {
          const modelAction = JSON.parse(modelTurn.content);

          if (modelAction.action === 'runCommand' || modelAction.action === 'runScript' || modelAction.action === 'readFile') {
            const toolContentObject = JSON.parse(toolTurn.content);
            const commandResult = toolContentObject.functionResponse?.response;

            if (commandResult) {
              const commandStr =
                modelAction.action === 'runCommand'
                  ? `${modelAction.parameters.command} ${modelAction.parameters.args.join(' ')}`
                  : modelAction.action === 'runScript'
                  ? `python ${modelAction.parameters.name}`
                  : `${modelAction.parameters.filePath}`;
              
              // desc 배열을 유지하기 위해 push를 사용합니다.
              // 클라이언트가 reverse() 할 것을 예상하여, result를 action보다 먼저 push 합니다.
              clientHistory.push({
                ...toolTurn,
                id: toolTurn.id + '-result',
                role: 'system',
                type: 'action_result',
                content: commandResult.success
                  ? commandResult.stdout
                  : commandResult.stderr || commandResult.error,
                success: commandResult.success,
              });

              clientHistory.push({
                ...modelTurn,
                id: modelTurn.id + '-action',
                role: 'system',
                type: 'action',
                content: `> **${modelAction.action}**: \`${commandStr}\``,
              });

              processedIndices.add(i);
              processedIndices.add(i + 1);
              continue;
            }
          }
        } catch (e) {
          this.logger.warn(`Failed to process action/result pair: ${e}`);
        }
      }

      clientHistory.push(turn);
    }
    // desc 순서의 배열을 그대로 반환합니다.
    return clientHistory;
  }

  async countConversations(sessionId: string): Promise<number> {
    return this.prisma.conversation.count({
      where: { sessionId },
    });
  }

  async getConversations(sessionId: string, limit = 50) {
    const history = await this.prisma.conversation.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return history
      .map((conv) => {
        const parts: Part[] = [];

        if (conv.role === 'model') {
          try {
            // 모델의 응답은 도구 호출(functionCall)이거나 일반 텍스트입니다.
            const parsed = JSON.parse(conv.content);
            if (parsed.action && parsed.parameters) {
              parts.push({
                functionCall: { name: parsed.action, args: parsed.parameters },
              });
            } else {
              parts.push({ text: conv.content });
            }
          } catch (e) {
            parts.push({ text: conv.content });
          }
        } else if (conv.role === 'user') {
          // 사용자의 입력은 텍스트와 이미지(선택)를 포함합니다.
          if (conv.content) {
            parts.push({ text: conv.content });
          }
          if (conv.imageBase64) {
            parts.push({
              inlineData: { mimeType: 'image/png', data: conv.imageBase64 },
            });
          }
        } else if (conv.role === 'tool') {
          // 도구의 응답은 functionResponse 파트입니다.
          try {
            const toolPart = JSON.parse(conv.content);
            parts.push(toolPart);
          } catch (e) {
            console.error('Failed to parse tool content from DB', e);
          }
        }

        return {
          role: conv.role === 'tool' ? 'function' : (conv.role as 'user' | 'model'),
          parts: parts,
        };
      })
      .filter((h) => h.parts.length > 0);
  }
}
