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
    role: 'user' | 'model' | 'tool' | 'function',
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
        (turn.role === 'tool' || turn.role === 'function') &&
        i + 1 < history.length &&
        history[i + 1].role === 'model'
      ) {
        const toolTurn = turn;
        const modelTurn = history[i + 1];

        try {
          const modelAction = JSON.parse(modelTurn.content);

          if (modelAction.action === 'runCommand' || modelAction.action === 'runScript' || modelAction.action === 'readFile') {
            const toolContentObject = JSON.parse(toolTurn.content);
            // Check for both legacy and new structures
            const commandResult = toolContentObject.functionResponse?.response || toolContentObject;

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
                  ? (commandResult.stdout || commandResult.content)
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
    const dbHistory = await this.prisma.conversation.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    const apiHistory: { role: 'user' | 'model' | 'function'; parts: Part[] }[] = [];

    for (let i = 0; i < dbHistory.length; i++) {
      const turn = dbHistory[i];
      const parts: Part[] = [];

      if (turn.role === 'user') {
        if (turn.content) {
          parts.push({ text: turn.content });
        }
        if (turn.imageBase64) {
          parts.push({ inlineData: { mimeType: 'image/png', data: turn.imageBase64 } });
        }
        apiHistory.push({ role: 'user', parts });

      } else if (turn.role === 'model') {
        try {
          const parsed = JSON.parse(turn.content);
          if (parsed.action && parsed.parameters) {
            parts.push({ functionCall: { name: parsed.action, args: parsed.parameters } });
          } else {
            parts.push({ text: turn.content });
          }
        } catch (e) {
          parts.push({ text: turn.content });
        }
        apiHistory.push({ role: 'model', parts });

      } else if (turn.role === 'function' || turn.role === 'tool') { // Legacy 'tool' support
        // A function/tool response always follows a model's function call.
        const modelTurn = apiHistory[apiHistory.length - 1];
        if (modelTurn && modelTurn.role === 'model' && modelTurn.parts[0]?.functionCall) {
          try {
            const toolResult = JSON.parse(turn.content);
            parts.push({
              functionResponse: {
                name: modelTurn.parts[0].functionCall.name,
                response: { output: toolResult.content },
              },
            });
            apiHistory.push({ role: 'function', parts });
          } catch(e) {
             this.logger.error(`Failed to parse tool content from DB for turn ${turn.id}`, e);
          }
        }
      }
    }
    return apiHistory;
  }
}
