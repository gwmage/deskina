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
          const parsedModelContent = JSON.parse(modelTurn.content);
          
          // Check for the new `functionCall` structure
          if (parsedModelContent.functionCall) {
            const { name, args } = parsedModelContent.functionCall;
            const toolResult = JSON.parse(toolTurn.content);

            if (toolResult) {
              let commandStr = '';
              if (name === 'runCommand') {
                commandStr = `${args.command} ${(args.args || []).join(' ')}`;
              } else if (name === 'runScript') {
                commandStr = `python ${args.name}`;
              } else if (name === 'readFile') {
                commandStr = `${args.filePath}`;
              }
              
              // desc 순서 유지를 위해 result를 먼저 push
              clientHistory.push({
                ...toolTurn,
                id: toolTurn.id + '-result',
                role: 'system',
                type: 'action_result',
                content: toolResult.success
                  ? (toolResult.stdout || toolResult.content || 'Execution successful with no output.')
                  : (toolResult.stderr || toolResult.error || 'Execution failed.'),
                success: toolResult.success,
              });

              clientHistory.push({
                ...modelTurn,
                id: modelTurn.id + '-action',
                role: 'system',
                type: 'action',
                content: `> **${name}**: \`${commandStr}\``,
              });

              processedIndices.add(i);
              processedIndices.add(i + 1);
              continue; // 이 두 턴은 처리되었으므로 건너뜁니다.
            }
          }
        } catch (e) {
          this.logger.warn(`Failed to process action/result pair for client: ${e}`);
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
          // `functionCall` 객체 구조를 우선적으로 확인합니다.
          if (parsed.functionCall) {
            parts.push({ functionCall: parsed.functionCall });
          // 레거시 `action`/`parameters` 형식을 지원합니다.
          } else if (parsed.action && parsed.parameters) {
            parts.push({ functionCall: { name: parsed.action, args: parsed.parameters } });
          } else {
            parts.push({ text: turn.content });
          }
        } catch (e) {
          parts.push({ text: turn.content });
        }
        apiHistory.push({ role: 'model', parts });

      } else if (turn.role === 'function' || turn.role === 'tool') { // 'tool' 레거시 지원
        // 함수/툴 응답은 항상 모델의 함수 호출 뒤에 옵니다.
        const modelTurn = apiHistory[apiHistory.length - 1];
        if (modelTurn && modelTurn.role === 'model' && modelTurn.parts[0]?.functionCall) {
          try {
            const toolResultObject = JSON.parse(turn.content);
            // 저장된 결과 객체를 AI가 기대하는 { output: '...' } 형식으로 변환합니다.
            const output = toolResultObject.success
              ? (toolResultObject.stdout || toolResultObject.content || 'Command executed successfully with no output.')
              : `Error: ${toolResultObject.stderr || toolResultObject.error || 'Command failed with no error message.'}`;

            parts.push({
              functionResponse: {
                name: modelTurn.parts[0].functionCall.name,
                response: { output },
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
