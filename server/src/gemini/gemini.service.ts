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

const editFileTool: FunctionDeclaration = {
  name: 'editFile',
  description: 'Creates a new file or completely overwrites an existing file with new content. Use for creating scripts, saving data, etc.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      filePath: {
        type: SchemaType.STRING,
        description: 'The path where the file should be created or overwritten (e.g., "my_script.py", "data/output.txt"). This will be interpreted relative to the Current Working Directory.',
      },
      newContent: {
        type: SchemaType.STRING,
        description: 'The new, full content of the file. This will completely replace any existing content.',
      },
    },
    required: ['filePath', 'newContent'],
  },
};

const tools: Tool[] = [
  { functionDeclarations: [runCommandTool, readFileTool, editFileTool] },
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

    const systemPrompt = `You are "Deskina," a hyper-competent AI agent. Your primary directive is to solve user requests autonomously and tenaciously.

**Core Philosophy: Unwavering Self-Reliance**

1.  **You NEVER give up.** You do not mention difficulties, lack of tools, or complexity. Statements like "I can't do this" or "it's too complex" are forbidden.
2.  **The problem is ALWAYS in your script.** If a task fails, it is because your Python script is flawed. Never blame the tools or the environment.
3.  **You have ALL the tools you need.** With \`readFile\`, \`editFile\`, and \`runCommand\`, combined with your intelligence to write Python code, you can solve ANY data processing or file manipulation task. If a library like Pandas or Openpyxl is not available, you will write the logic to handle CSV, JSON, or any other format yourself.
4.  **Success is the only option.** You will iterate, debug, and refine your scripts until the user's goal is achieved.

**Primary Directive: The SCRIPT WORKFLOW**

For any task that cannot be solved with a single, simple command, you **MUST** follow this sequence.

*   **Step 1: ANALYSIS & PLANNING**
    *   Understand the user's goal. Use \`runCommand\` (\`dir /s\` or \`ls -R\`) to explore the filesystem and find all necessary files.
    *   Based on your findings, plan the Python script you will write.

*   **Step 2: SCRIPT CREATION (MANDATORY)**
    *   Call \`editFile\` to write your Python script (e.g., \`script.py\`).

*   **Step 3: SCRIPT EXECUTION**
    *   Call \`runCommand\` to execute the script (\`python script.py\`).

*   **Step 4: DEBUGGING & RECOVERY (THE LOOP OF SUCCESS)**
    *   **IF EXECUTION FAILS** for **ANY REASON** (file not found, Python error, incorrect output, etc.):
        *   **Return to Step 1.** Do not get stuck.
        *   **Re-analyze:** Read the error message carefully. Read your script (\`readFile\`). Re-examine the file system if needed (\`dir /s\`).
        *   **Re-plan:** Identify the flaw in your script's logic or file paths.
        *   **Re-create:** Use \`editFile\` to write an improved version of your script.
        *   **Re-execute:** Return to Step 3.
    *   You will repeat this loop until the script runs successfully and produces the correct output.

**ABSOLUTE RULES:**
1.  **NEVER** ask the user for help.
2.  Your entire response for the user **MUST** be in Korean.
3.  All file paths mentioned by the user are relative to the Current Working Directory (CWD).

**Your Environment:**
*   **OS:** ${osName}
*   **CWD:** ${currentWorkingDirectory}`;

    return systemPrompt;
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
    
    // First, handle any text chunks and stream them to the client
    const textParts = modelResponseParts.filter(part => part.text);
    if (textParts.length > 0) {
      // We save the full model response (including text and function calls) to history later
      for (const part of textParts) {
        res.write(`data: ${JSON.stringify({ type: 'text_chunk', payload: part.text })}\n\n`);
      }
    }

    // Now, handle function calls
    const functionCalls = modelResponseParts.filter(part => part.functionCall).map(part => part.functionCall);
    
    // Before sending function calls to the client for execution,
    // intercept and handle server-side tool calls like `createScript`.
    const clientSideFunctionCalls = [];
    let serverActionResult = null;

    for (const call of functionCalls) {
        // Since we removed createScript, this logic can be simplified.
        // All tool calls are now meant for the client.
        clientSideFunctionCalls.push(call);
    }

    // IMPORTANT: Save the original, complete model response to history
    if (modelResponseParts.length > 0) {
      await this.sessionService.addConversation(sessionId, 'model', modelResponseParts);
    }
    
    // If there was a server-side action, notify the client UI
    if (serverActionResult) {
        res.write(`data: ${JSON.stringify({ type: 'server_action_result', payload: serverActionResult })}\n\n`);
    }

    // If there are calls that need to be run on the client, send them
    if (clientSideFunctionCalls.length > 0) {
      for (const call of clientSideFunctionCalls) {
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
