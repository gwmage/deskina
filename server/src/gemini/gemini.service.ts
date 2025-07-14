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
    return `You are "Deskina," a hyper-competent AI agent. Your goal is to achieve the user's objective with the minimum number of conversational turns. Be proactive and decisive.

You are currently operating in the directory: ${currentWorkingDirectory}

**Core Operating Principles:**

1.  **Find Files First (Top Priority Rule):** If the user mentions a specific filename (e.g., "analyze App.js," "find my-script.py," "read config.json"), your immediate and only first action is to run the recursive search command for that file. **Do not list the directory first.**
    *   **Windows:** Use \`dir /s /b FILENAME\`
    *   **macOS/Linux:** Use \`find . -name "FILENAME"\`
    *   After the command returns the full path, use \`readFile\` on that path.

2.  **Master the Command Line:** For all other tasks, your \`runCommand\` tool is a direct interface to the user's OS shell. You can and should use any command-line tool to accomplish the goal.
    *   **Think like a power user:** Use \`grep\`/\`findstr\`, \`netstat\`, \`ps\`/\`tasklist\`, \`curl\`, etc.
    *   **Don't describe your plan.** Just execute the first logical command.

3.  **No Excuses, Only Solutions (The Scripting Mandate):** It is absolutely forbidden for you to say "I cannot do that," "I can't," or any similar phrase of refusal. If you determine a task is impossible using the command line, your one and only path forward is to call the \`createScript\` tool. Write a Python script to solve the problem. There is no other option. Giving up is not an option.
    *   **Use Case:** Complex logic, API interaction, data processing, file manipulation, etc. If the CLI is clumsy, write a script.

4.  **Autonomous Workflow (for general analysis):** When given a *vague* task without a specific filename (e.g., "analyze this project"):
    a. Start by listing files with \`runCommand\` to understand the context.
    b. Based on the file list, form a multi-step plan in your head.
    c. Execute the plan step-by-step using tool calls.
    d. **Only after you have all the information** should you respond with a text summary.

5.  **No Useless Questions:** Never ask for information you can get with a tool. Decide for yourself and act.

6.  **Tool Calls are Your Voice:** Use tools as your primary way of acting. If a tool fails, analyze the error and try a different command or arguments.

7.  **Language:** All final text analysis and responses to direct questions must be in Korean.`;
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
      currentWorkingDirectory?: string; // Add CWD
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
          // tool_response만 있고 세션 ID가 없는 경우는 비정상적 상황
          throw new Error('Cannot process tool result without a valid session ID.');
        }
      }

      // 1. 대화 기록을 가져옵니다.
      const history = await this.sessionService.getConversations(sessionId);
      
      // 2. tool_response가 있는 경우, 대화 기록에 추가합니다.
      if (tool_response) {
        // DB에 tool 결과를 저장합니다.
        // 클라이언트에서 받은 raw result를 functionResponse 형식으로 감싸서 저장합니다.
        const functionResponsePart = {
          functionResponse: {
            name: tool_response.name,
            response: tool_response.result,
          },
        };

        await this.sessionService.addConversation(
          sessionId,
          'tool',
          JSON.stringify(functionResponsePart),
        );
        
        // 현재 대화 세션(Gemini)에 이 결과를 반영합니다.
        history.push({
          role: 'function',
          parts: [functionResponsePart],
        });
      }

      const chat = this.getModelWithTools().startChat({
        history: history,
        systemInstruction: {
          role: 'user',
          parts: [{ text: this.getSystemPrompt(platform, currentWorkingDirectory) }],
        },
      });

      // 3. tool_response가 아닌 일반 메시지인 경우, 대화를 시작합니다.
      if (message) {
        const userParts: Part[] = [{ text: message }];
        if (imageBase64) {
          userParts.push(this.convertBase64ToPart(imageBase64, 'image/png'));
        }
  
        await this.sessionService.addConversation(
          sessionId,
          'user',
          message,
          imageBase64,
        );
        
        await this.executeAndRespond(res, userId, sessionId, chat, userParts);

      } else if (tool_response) {
        // 4. tool_response만 있는 경우, 빈 메시지를 보내 AI의 후속 응답을 유도합니다.
        await this.executeAndRespond(res, userId, sessionId, chat, []);
      }
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

  async handleToolResult(
    userId: string,
    body: { sessionId: string; command:string; args: any; result: any, currentWorkingDirectory?: string },
    res: Response,
  ) {
    const { sessionId, command, args, result, currentWorkingDirectory } = body;
    
    const toolExecutionResult: Part = {
      functionResponse: {
        name: command, 
        response: result,
      },
    };

    try {
        await this.sessionService.addConversation(sessionId, 'tool', JSON.stringify(toolExecutionResult));
        
        const history = await this.sessionService.getConversations(sessionId);
        const chat = this.getModelWithTools().startChat({
            history: history.slice(0, -1), // 마지막 tool 응답은 제외하고 history 구성
            systemInstruction: { role: 'user', parts: [{ text: this.getSystemPrompt('win32', currentWorkingDirectory) }] }, 
        });

        // tool 응답을 다음 메시지로 전달
        await this.executeAndRespond(res, userId, sessionId, chat, [toolExecutionResult]);

    } catch (error) {
        this.logger.error(`Error handling tool result for user ${userId}:`, error.stack);
        if (!res.writableEnded) {
            const errorMessage = error.message || '';
            let userFriendlyMessage = '도구 실행 결과 처리 중 오류가 발생했습니다.';
    
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
