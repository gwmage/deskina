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

  private getSystemPrompt(platform: string): string {
    return `You are "Deskina," an AI agent designed to operate within a user's desktop environment on ${platform}. Your primary function is to assist users by executing tasks on their local machine.

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
    let result = await chat.sendMessage(initialParts);

    while (true) {
      const call = result.response.functionCalls()?.[0];
      if (!call) {
        // AI가 도구를 호출하지 않고 텍스트로만 응답한 경우
        const text = result.response.text();
        await this.sessionService.addConversation(sessionId, 'model', text);
        
        // 텍스트를 스트리밍하여 클라이언트에 전송
        for (const char of text) {
          res.write(`data: ${JSON.stringify({ type: 'text_chunk', payload: char })}\n\n`);
          await new Promise((r) => setTimeout(r, 5));
        }
        break; // 루프 종료
      }

      // AI가 도구를 호출한 경우, 해당 도구를 실행합니다.
      const { name, args } = call;
      this.logger.log(`AI called tool: ${name}`, args);
      
      let actionForClient: { action: string; parameters: any; };
      let toolResultPayload: any;

      if (name === 'listScripts') {
        const scripts = await this.scriptsService.findAllForUser(userId);
        toolResultPayload = { scripts: scripts.map(s => s.name) };
      } 
      else if (name === 'createScript') {
        const scriptArgs = args as { name: string; description: string; code: string };
        await this.scriptsService.create({
          userId,
          name: scriptArgs.name,
          description: scriptArgs.description,
          filePath: `scripts/${scriptArgs.name}`,
          content: scriptArgs.code,
        });
        toolResultPayload = { success: true, message: `Script "${scriptArgs.name}" created.` };
      } 
      else if (name === 'runScript') {
        const scriptArgs = args as { name: string };
        const script = await this.prisma.script.findUnique({ where: { userId_name: { userId, name: scriptArgs.name } } });
        if (script) {
          actionForClient = { action: 'runScript', parameters: script };
        } else {
          toolResultPayload = { success: false, error: `Script "${scriptArgs.name}" not found.` };
        }
      }
      else if (name === 'runCommand') {
        const commandArgs = args as { command: string; args: string[] };
        actionForClient = { action: 'runCommand', parameters: commandArgs };
      }
      else if (name === 'readFile') {
        const fileArgs = args as { filePath: string };
        actionForClient = { action: 'readFile', parameters: fileArgs };
      }
      else {
        this.logger.warn(`Unknown tool called: ${name}`);
        toolResultPayload = { success: false, error: `Unknown tool: ${name}` };
      }
      
      if (actionForClient) {
        // 클라이언트 측 실행이 필요한 도구 (runCommand, runScript)
        await this.sessionService.addConversation(sessionId, 'model', JSON.stringify(actionForClient));
        res.write(`data: ${JSON.stringify({ type: 'final', payload: actionForClient })}\n\n`);
        break; 
      } else {
        // 서버 측에서 실행이 완료된 도구
        result = await chat.sendMessage([
          { functionResponse: { name, response: toolResultPayload } },
        ]);
      }
    }
  }


  async generateResponse(
    userId: string,
    body: { sessionId?: string; message: string; platform: string; imageBase64?: string },
    res: Response,
  ) {
    const { message, platform, imageBase64 } = body;
    let { sessionId } = body;

    try {
      if (!sessionId || !(await this.sessionService.findById(sessionId))) {
        const newSession = await this.sessionService.create(message.substring(0, 30), userId);
        sessionId = newSession.id;
        res.write(`data: ${JSON.stringify({ type: 'session_id', payload: sessionId })}\n\n`);
      }

      const history = await this.sessionService.getConversations(sessionId);
      const chat = this.getModelWithTools().startChat({
        history: history,
        systemInstruction: { role: 'user', parts: [{ text: this.getSystemPrompt(platform) }] },
      });

      const userParts: Part[] = [{ text: message }];
      if (imageBase64) {
        userParts.push(this.convertBase64ToPart(imageBase64, 'image/png'));
      }
      
      await this.sessionService.addConversation(sessionId, 'user', message, imageBase64);

      await this.executeAndRespond(res, userId, sessionId, chat, userParts);
      
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
    body: { sessionId: string; command:string; args: any; result: any },
    res: Response,
  ) {
    const { sessionId, command, args, result } = body;
    
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
            systemInstruction: { role: 'user', parts: [{ text: this.getSystemPrompt('win32') }] }, 
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
