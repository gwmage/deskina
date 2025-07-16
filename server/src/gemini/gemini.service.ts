import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  Part,
  ChatSession,
  FunctionDeclaration,
  Tool,
  SchemaType,
} from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SessionService } from '../session/session.service';
import { ScriptsService } from '../scripts/scripts.service';
import { Response } from 'express';

const runCommandTool: FunctionDeclaration = {
  name: 'runCommand',
  description: 'Executes a shell command on the user\'s local machine.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      command: {
        type: SchemaType.STRING,
        description: 'The command to execute (e.g., "ls", "dir", "python").',
      },
      args: {
        type: SchemaType.ARRAY,
        description: 'An array of arguments for the command.',
        items: { type: SchemaType.STRING },
      },
    },
    required: ['command'],
  },
};

const readFileTool: FunctionDeclaration = {
  name: 'readFile',
  description: "Reads the entire content of a file at a specified path.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      filePath: {
        type: SchemaType.STRING,
        description: "The absolute or relative path to the file.",
      },
    },
    required: ['filePath'],
  },
};

const createScriptTool: FunctionDeclaration = {
  name: 'createScript',
  description: 'Creates a new Python script file and saves it.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      name: {
        type: SchemaType.STRING,
        description: 'The name of the script file (e.g., "analyze.py").',
      },
      description: {
        type: SchemaType.STRING,
        description: 'A brief description of what the script does.',
      },
      code: {
        type: SchemaType.STRING,
        description: 'The Python code content of the script.',
      },
    },
    required: ['name', 'code'],
  },
};

const listScriptsTool: FunctionDeclaration = {
  name: 'listScripts',
  description: 'Lists all available scripts the user has created.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {},
  },
};

const runScriptTool: FunctionDeclaration = {
  name: 'runScript',
  description: 'Executes a previously created Python script by its name.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      name: {
        type: SchemaType.STRING,
        description: 'The name of the script to execute.',
      },
    },
    required: ['name'],
  },
};

const tools: Tool[] = [
  { functionDeclarations: [runCommandTool, readFileTool, createScriptTool, listScriptsTool, runScriptTool] },
];

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private genAI: GoogleGenerativeAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    private readonly scriptsService: ScriptsService,
  ) {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }

  private getModelWithTools() {
    return this.genAI.getGenerativeModel({
      model: 'gemini-1.5-flash-latest',
      tools: tools,
    });
  }

  private getSystemPrompt(platform: string, currentWorkingDirectory: string): string {
    const isWindows = platform.toLowerCase().startsWith('win');
    const osName = isWindows ? 'Windows' : 'Unix-like (macOS, Linux)';

    const examples = isWindows
      ? `  - List files: \`dir\`\n  - Find files: \`dir /s /b "FILENAME"\`\n  - Read file: \`type "FILEPATH"\`\n  - Check current directory: \`cd\` or \`echo %cd%\``
      : `  - List files: \`ls -l\`\n  - Find files: \`find . -name "FILENAME"\`\n  - Read file: \`cat "FILEPATH"\`\n  - Check current directory: \`pwd\``;

    return `You are "Deskina," a helpful AI assistant.

**CONTEXT:**
- **Operating System:** You are on **${osName}**. Use commands compatible with this OS.
- **Current Directory:** \`${currentWorkingDirectory}\`
- **Command Examples for ${osName}:**
${examples}

**YOUR WORKFLOW:**

1.  The user asks a question (e.g., "What is the current directory?").
2.  You use a tool to find the answer (e.g., \`runCommand: cd\`).
3.  The tool's result is given back to you.
4.  **Your next and final response MUST be a complete, user-friendly sentence in Korean that answers the user's original question.**
    *   **Correct Example:** "현재 작업 경로는 \`C:\\Users\\...\` 입니다."
    *   **Incorrect Example:** Just outputting the tool call result.

**IMPORTANT RULES:**
- **Always Answer in Korean:** All final, user-facing text must be in Korean.
- **Autonomous Error Correction:** If a command fails because it's for the wrong OS, **do not ask the user,** immediately try the correct command for **${osName}**.
- **Be Proactive:** Use tools to get answers. Do not explain your plan, just act.
- **No Surrender:** If you cannot get the information with commands, use the \`createScript\` tool. Never give up.`;
  }

  private convertBase64ToPart(base64: string, mimeType: string): Part {
    return { inlineData: { data: base64, mimeType } };
  }

  private async executeAndRespond(
    res: Response,
    userId: string,
    sessionId: string,
    chat: ChatSession,
    initialParts: Part[],
  ) {
    this.logger.log('--- final data sent to AI ---');
    this.logger.log(JSON.stringify(initialParts, null, 2));

    const stream =
      initialParts.length > 0
        ? await chat.sendMessageStream(initialParts)
        : await chat.sendMessageStream('');

    let fullResponseText = '';
    let functionCall: { name: string; args: any; } | null = null;

    for await (const chunk of stream.stream) {
      // 텍스트가 있으면 스트리밍합니다.
      const chunkText = chunk.text();
      if (chunkText) {
        fullResponseText += chunkText;
        res.write(
          `data: ${JSON.stringify({ type: 'text_chunk', payload: chunkText })}\n\n`,
        );
      }

      // 함수 호출이 있으면 저장하고 루프를 빠져나갑니다.
      const call = chunk.functionCalls()?.[0];
      if (call) {
        functionCall = call;
        break;
      }
    }

    // 스트리밍 후 DB에 모델 응답(텍스트 또는 함수 호출)을 저장합니다.
    if (functionCall) {
       await this.sessionService.addConversation(
        sessionId,
        'model',
        JSON.stringify({ action: functionCall.name, parameters: functionCall.args }),
       );
    } else if (fullResponseText.trim()) {
      await this.sessionService.addConversation(
        sessionId,
        'model',
        fullResponseText,
      );
    }

    // 함수 호출이 있었다면 클라이언트에 액션을 전달합니다.
    if (functionCall) {
        // 이 부분은 기존 로직에서 클라이언트 액션을 처리하던 부분을 참고하여 재구성합니다.
        // 현재는 runCommand, readFile, runScript만 클라이언트 액션입니다.
        const clientActionTools = ['runCommand', 'readFile', 'runScript', 'editFile', 'createScript'];
        if (clientActionTools.includes(functionCall.name)) {
             res.write(`data: ${JSON.stringify({ type: 'final', payload: { action: functionCall.name, parameters: functionCall.args } })}\n\n`);
        } else {
            // 서버에서 처리해야 할 툴 (e.g. listScripts)
            // 이 부분은 현재 구현에서 제외되었으므로, 일단 경고만 남깁니다.
            this.logger.warn(`Server-side tool call '${functionCall.name}' is not handled in this flow.`);
            res.write(`data: ${JSON.stringify({ type: 'final', payload: {} })}\n\n`);
        }
    } else {
        // 텍스트 응답만 있었던 경우
        res.write(`data: ${JSON.stringify({ type: 'final', payload: {} })}\n\n`);
    }

    res.end();
  }


  async generateResponse(
    userId: string,
    body: {
      sessionId?: string;
      message?: string;
      platform?: string;
      imageBase64?: string;
      currentWorkingDirectory?: string;
      tool_response?: { name: string; id: string; result: any };
    },
    res: Response,
  ) {
    const { message, platform, imageBase64, tool_response, currentWorkingDirectory } = body;
    let { sessionId } = body;

    try {
      if (!sessionId || !(await this.sessionService.findById(sessionId))) {
        if (message) {
          const newSession = await this.sessionService.create(
            message.substring(0, 30),
            userId,
          );
          sessionId = newSession.id;
          res.write(
            `data: ${JSON.stringify({ type: 'session_id', payload: sessionId })}\n\n`,
          );
        } else {
          throw new Error('Cannot process request without a valid session ID.');
        }
      }

      const rawHistory = await this.sessionService.getConversations(sessionId);
      
      const history = rawHistory
        .map(h => {
          if (h.role === 'model' && h.parts && h.parts[0]?.text) {
            try {
              const parsed = JSON.parse(h.parts[0].text);
              if (parsed.action && parsed.parameters) {
                return {
                  role: 'model',
                  parts: [{ functionCall: { name: parsed.action, args: parsed.parameters } }],
                };
              }
              if (parsed.type === 'action_result') {
                return null;
              }
            } catch (e) {}
          }
          return h;
        })
        .filter(Boolean);

      let partsForAI: Part[] = [];

      if (message) {
        await this.sessionService.addConversation(sessionId, 'user', message, imageBase64);
        partsForAI.push({ text: message });
        if (imageBase64) {
          partsForAI.push(this.convertBase64ToPart(imageBase64, 'image/png'));
        }
      } else if (tool_response) {
        let processedResult: any;
        let success = false;
        if (tool_response.result && typeof tool_response.result === 'object') {
            const result = tool_response.result;
            success = result.success;
            if (result.success) {
                processedResult = (result.stdout ?? '') + (result.content ?? '') || 'Command executed successfully with no output.';
            } else {
                processedResult = `Error: ${(result.stderr ?? '') + (result.error ?? '') || 'Command failed with no error message.'}`;
            }
        } else {
            success = true;
            processedResult = tool_response.result ?? 'No result provided.';
        }

        await this.sessionService.addConversation(
          sessionId, 'model', JSON.stringify({ type: 'action_result', content: processedResult, success })
        );
        
        partsForAI.push({
          functionResponse: {
            name: tool_response.name,
            response: { output: processedResult },
          },
        });
        
        // Add the function call that led to this result to the history for context
        const lastTurn = history[history.length -1];
        if (lastTurn?.role === 'model' && lastTurn.parts[0]?.functionCall) {
          // It's already in the history from the parsing logic
        } else {
          // This case might need handling if the flow changes, for now it's okay.
        }
      }

      const chat = this.getModelWithTools().startChat({
        history: history,
        systemInstruction: {
          role: 'user',
          parts: [{ text: this.getSystemPrompt(platform, currentWorkingDirectory) }],
        },
      });
      
      await this.executeAndRespond(res, userId, sessionId, chat, partsForAI);

    } catch (error) {
      this.logger.error(`Error in generateResponse for user ${userId}:`, error.stack);
      if (!res.writableEnded) {
        const errorMessage = error.message || '';
        let userFriendlyMessage = '응답 생성 중 오류가 발생했습니다.';

        if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('quota')) {
          userFriendlyMessage = 'Google AI API 일일 사용량을 초과했습니다. 잠시 후 다시 시도해주세요.';
        } else if (errorMessage.toLowerCase().includes('safety')) {
          userFriendlyMessage = '요청 또는 응답이 안전 정책에 의해 차단되었습니다. 다른 방식으로 질문해주세요.';
        }

        if (sessionId) {
          await this.sessionService.addConversation(sessionId, 'model', userFriendlyMessage);
        }
        
        res.write(
          `data: ${JSON.stringify({ type: 'error', payload: { message: userFriendlyMessage } })}\n\n`,
        );
      }
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  }
}
