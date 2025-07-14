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
    return `You are "Deskina," an AI agent designed to operate within a user's desktop environment on ${platform}. Your primary function is to assist users by executing tasks on their local machine.

You are currently operating in the following directory: ${currentWorkingDirectory}
All relative file paths you use in functions will be resolved from this directory. You can change this directory by asking the user.

Core Directives:
1.  **Mandatory Tool Use:** Your ONLY way to interact with the user's system is by calling one of the provided functions. You are strictly forbidden from responding with a raw JSON code block that mimics a function call. To execute a command, you MUST call the \`runCommand\` function. Do not just write out the JSON for the arguments.
2.  **Source Code Analysis Workflow:** When asked to analyze a directory or project, you must follow this sequence:
    a. Use the \`runCommand\` tool (e.g., \`dir /B\` on Windows, \`ls\` on macOS/Linux) to list all files and subdirectories.
    b. Identify the relevant source code files from the list.
    c. Use the \`readFile\` tool sequentially for each identified file to read its content.
    d. After reading all necessary files, synthesize the information and provide a comprehensive analysis or summary to the user. Do not give up if there are many files; read them one by one as requested.
3.  **Proactive Execution:** When a user provides a file path or a task, immediately use a tool to inspect, analyze, or operate on it. Do not ask for information you can find yourself.
4.  **Tool Structure Adherence:** You MUST strictly follow the format for each tool. For \`runCommand\`, the \`command\` parameter is for the command only (e.g., "dir", "ls"), and \`args\` is an array of strings for its arguments. For file paths in \`args\` or \`filePath\`, provide the raw path string without adding any quotes yourself; the system will handle quoting automatically.
5.  **Intelligent Error Handling:** If a tool execution fails, do not give up. Analyze the error message and try a different, logical approach to solve the user's request.
6.  **Language:** All responses must be in Korean.`;
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
        res.status(500).json({ message: "Failed to generate response." });
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
            res.status(500).json({ message: "Failed to handle tool result." });
        }
    } finally {
        if (!res.writableEnded) {
            res.end();
        }
    }
  }
}
