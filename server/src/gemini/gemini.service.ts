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
import { ConversationStreamDto } from './dto/conversation-stream.dto';

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
    // fileSearchCommand is not used here anymore, but let's keep it in case it's needed elsewhere
    // const fileSearchCommand = isWindows ? 'dir /s /b' : 'find . -name'; 

    return `**MASTER RULE: Your entire response for the user must be in Korean.**

You are "Deskina," a hyper-competent, autonomous AI agent. Your goal is to achieve the user's request by chaining together tool calls without asking for help.

**CRITICAL RULES:**
1.  **NEVER ask the user for information.** If you need something, find it yourself using tools like \`runCommand\` and \`readFile\`.
2.  **DO NOT make excuses** like "I cannot access the file system." You have the tools, use them.
3.  **TRUST your tools.** The output of a tool is your ground truth. Base your next step on it.

**Your workflow is a simple, repeating loop:**
1.  **PLAN:** Based on the current context, decide the single next step.
2.  **EXECUTE:** Call the one tool needed for that step (e.g., \`runCommand\`, \`readFile\`).
3.  **LEARN & RE-PLAN:** Look at the result of the tool.
    *   If it succeeded, what is the next logical step in the plan?
    *   If it failed, what is the cause? How can you fix it?
4.  Repeat until the user's goal is complete.

**HOW TO HANDLE COMMON SITUATIONS:**

*   **IF a file search returns multiple paths:**
    *   **THEN** you **MUST** choose the best one without asking the user. Use this logic:
        1.  **First, eliminate** any paths that contain \`node_modules\`, \`generated\`, \`.cache\`, or other dependency/build directories.
        2.  **From the remaining paths, select** the one that most closely matches the user's request context (e.g., if they mentioned "server", pick the path with "server" in it) and the current project directory.
        3.  If still undecided, pick the shortest, most direct path.
    *   **NEVER** tell the user you are confused by multiple files. Make a decision and act.

*   **IF the user asks to do something complex (like "create an Excel file from a schema"):**
    *   **THEN** your plan **MUST** be to use this exact Python scripting workflow without deviation:
        1.  Use \`runCommand\` to find the exact path of the source file (e.g., \`dir /s /b *schema.prisma*\`).
        2.  *Use the file selection logic above to pick the correct path from the results.*
        3.  Use \`readFile\` with the full path to get the source data.
        4.  Use \`createScript\` to generate a Python script that reads the source, processes it (e.g., with pandas), and saves an Excel file.
        5.  Use \`runCommand\` to run \`pip install ...\` for any needed libraries.
        6.  Use \`runScript\` to execute the script.
    *   **DO NOT** ask for the schema content or the desired format. Figure it out.

*   **IF a command like \`cd\` fails:**
    *   **THEN** your **immediate next step** is to run \`dir\` (Windows) or \`ls -F\` (Unix) to see available directories.
    *   Based on that output, **retry the command** with the correct path.
    *   **DO NOT** give up.

**FINALLY:**
- Your OS is **${osName}**. Use the correct commands for it.
- Your current directory is \`${currentWorkingDirectory}\`.
- Report your final success to the user **in Korean.**`;
  }

  private convertBase64ToPart(base64: string, mimeType: string): Part {
    return { inlineData: { data: base64, mimeType } };
  }

  private async executeAndRespond(
    res: Response,
    userId: string,
    sessionId: string,
    chat: any,
  ) {
    const stream = await chat.sendMessageStream('');
    const response = await stream.response;

    // Defensive coding: Ensure candidates and content exist before accessing parts.
    const modelResponseParts = response?.candidates?.[0]?.content?.parts || [];
    
    if (modelResponseParts.length > 0) {
      await this.sessionService.addConversation(sessionId, 'model', modelResponseParts);
    }
    
    // Stream text chunks to the client
    for (const part of modelResponseParts) {
      if (part.text) {
        res.write(`data: ${JSON.stringify({ type: 'text_chunk', payload: part.text })}\n\n`);
      }
    }

    // Handle function calls
    const functionCalls = response.functionCalls();
    if (functionCalls && functionCalls.length > 0) {
      for (const call of functionCalls) {
        res.write(`data: ${JSON.stringify({ type: 'action', payload: call })}\n\n`);
      }
    } else if (modelResponseParts.length === 0) {
        // Handle cases where the model returns nothing (e.g., safety rejection)
        const emptyResponseText = "죄송합니다. 응답을 생성할 수 없습니다.";
        await this.sessionService.addConversation(sessionId, 'model', [{text: emptyResponseText}]);
        res.write(`data: ${JSON.stringify({ type: 'text_chunk', payload: emptyResponseText })}\n\n`);
    }

    res.end();
  }

  async generateResponse(
    userId: string,
    body: ConversationStreamDto,
    res: Response,
  ) {
    const {
      message,
      platform,
      imageBase64,
      tool_responses,
      currentWorkingDirectory,
    } = body;
    let { sessionId } = body;

    try {
      if (!sessionId || !(await this.sessionService.findById(sessionId))) {
        const title = message ? message.substring(0, 50) : 'Untitled Conversation';
        const session = await this.sessionService.create(title, userId);
        sessionId = session.id;
        res.write(`data: ${JSON.stringify({ type: 'session_id', payload: sessionId })}\n\n`);
      }
      
      const history = await this.sessionService.getConversations(sessionId);

      if (message) {
        const userParts: Part[] = [{ text: message }];
        if (imageBase64) {
          userParts.push({ inlineData: { mimeType: 'image/png', data: imageBase64 } });
        }
        await this.sessionService.addConversation(sessionId, 'user', userParts);
        history.push({ role: 'user', parts: userParts });
      }

      if (tool_responses && tool_responses.length > 0) {
        const lastModelTurn = history.length > 0 ? history[history.length - 1] : null;

        if (lastModelTurn?.role === 'model' && lastModelTurn.parts.some(p => p.functionCall)) {
            const functionCalls = lastModelTurn.parts.filter(p => p.functionCall).map(p => p.functionCall);
            
            if (functionCalls.length !== tool_responses.length) {
              this.logger.warn(`Mismatch between function calls (${functionCalls.length}) and tool responses (${tool_responses.length}).`);
              // Attempt to proceed, but this may indicate an issue.
            }

            const functionResponseParts: Part[] = [];
            
            for (let i = 0; i < tool_responses.length; i++) {
                const tool_response = tool_responses[i];
                const functionCall = functionCalls[i]; // Rely on the order

                if (!functionCall) {
                    this.logger.error(`Could not find matching function call for tool response at index ${i}. Skipping.`);
                    continue;
                }

                const result = tool_response.result;
                const output = result.success
                    ? result.stdout || result.content || 'Command executed successfully.'
                    : `Error: ${result.stderr || result.error || 'Command failed.'}`;

                functionResponseParts.push({
                    functionResponse: {
                        name: functionCall.name,
                        response: { output },
                    },
                });
            }

            if (functionResponseParts.length > 0) {
                await this.sessionService.addConversation(sessionId, 'function', functionResponseParts);
                history.push({ role: 'function', parts: functionResponseParts });
            }
        }
      }

      const chat = this.getModelWithTools().startChat({
        history: history,
        systemInstruction: {
          role: 'user',
          parts: [{ text: this.getSystemPrompt(platform, currentWorkingDirectory) }],
        },
      });
      await this.executeAndRespond(res, userId, sessionId, chat);

    } catch (error) {
      this.logger.error(`Error in generateResponse for user ${userId}:`, error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'An error occurred while generating the response.' });
      } else if (!res.writableEnded) {
        res.end(); // Ensure stream is properly closed on error
      }
    }
  }
}
