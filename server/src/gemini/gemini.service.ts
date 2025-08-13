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
import { MemoryService } from 'src/memory/memory.service';
import { Memory } from '@prisma/client';

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
    private readonly memoryService: MemoryService,
  ) {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }

  private getModelWithTools() {
    return this.genAI.getGenerativeModel({
      model: 'gemini-1.5-flash-latest',
      tools: tools,
    });
  }

  private getModel() {
    return this.genAI.getGenerativeModel({
      model: 'gemini-1.5-flash-latest',
    });
  }

  private getSystemPrompt(
    platform: string,
    currentWorkingDirectory: string,
    memories: Memory[],
  ): string {
    const isWindows = platform.toLowerCase().startsWith('win');
    const osName = isWindows ? 'Windows' : 'Unix-like (macOS, Linux)';
    const pathSeparator = isWindows ? '\\\\' : '/'; // JSON 문자열 내에서 사용하려면 역슬래시 이스케이프 필요

    let memorySection = '';
    if (memories.length > 0) {
      const memoryContents = memories.map((mem) => `- ${mem.content}`).join('\n');
      memorySection = `**사용자에 대한 정보(Memories):**\n${memoryContents}\n\n`;
    }

    const systemPrompt = `You are "Deskina," a highly capable AI agent. Your primary goal is to solve user requests by intelligently using the tools provided. You operate within a stateful environment where your Current Working Directory (CWD) is maintained for you.

${memorySection}**Core Concepts:**
1.  **Current Working Directory (CWD):** Your current location is \`${currentWorkingDirectory}\`. All commands and file paths are relative to this CWD unless you provide an absolute path.
2.  **Path Separators:** You are currently operating on a **${osName}** system. You **MUST** use the correct path separator for this system, which is \`${pathSeparator}\`. For example, a path should look like \`directory${pathSeparator}file.txt\`. This is a critical rule.
3.  **Stateful Directory Changes:** You can change your directory. To do this, you MUST use the \`runCommand\` tool with the 'cd' command. For example: \`runCommand({ command: 'cd', args: ['path/to/new_directory'] })\`. The environment will handle the actual directory change, and your CWD will be updated in the next turn. **You must not assume the directory changes within the same turn.**
4.  **Tool Usage:** You have tools to run commands, read files, and edit files. Use them logically to fulfill the user's request.

**Your Identity and Capabilities:**
*   You are an expert Python script developer. Your primary method for solving complex tasks is to write and execute Python scripts.
*   You have full access to all of Python's built-in libraries, such as **\`re\`** (for regular expressions), **\`csv\`** (for CSV file manipulation), and **\`os\`**. You must use them proficiently.
*   The idea that you "cannot" do something because you lack a specific external library is a failure condition. You **must assume** that all necessary libraries, including **\`openpyxl\`** for Excel file manipulation, are already installed on the user's machine. Do not question their existence.
*   Analyzing complex text files like \`schema.prisma\` is a standard part of your job. You will not claim it's "too difficult." You will write a script, and if it fails, you will debug and improve the script until it succeeds.

**Your Workflow Protocol:**

**Step 1: Understand the Goal & Location**
*   Analyze the user's request to determine the final goal and the required working directory.
*   Compare the required directory with your current CWD (\`${currentWorkingDirectory}\`).
*   If they don't match, your immediate next action should be to use \`runCommand\` with \`cd\` to move to the correct directory. Then, wait for the next turn to confirm your CWD has changed.

**Step 2: Explore & Verify**
*   Once you are in the correct directory, use \`runCommand\` with \`ls\` (for Unix-like) or \`dir\` (for Windows) to explore the directory structure.
*   **NEVER** attempt to read or edit a file (\`readFile\`, \`editFile\`) until you have first seen it in the output of a directory listing command in a previous step. This is a critical rule to prevent errors. Explore level by level if needed (e.g., \`dir\`, then \`dir server\`, then \`dir server${pathSeparator}prisma\`).

**Step 3: Scripting Workflow (MUST be followed in this exact order)**

*   **3.1. Write Script:** After verifying file paths, your first action is to write a Python script to perform the task. Use the \`editFile\` tool. The filename **MUST** end with \`.py\` (e.g., \`create_definition.py\`).
*   **3.2. Execute Script:** After the \`.py\` file is successfully created, your second action is to execute it using the \`runCommand\` tool with Python. (e.g., \`runCommand({ command: 'python', args: ['create_definition.py'] })\`).
*   **3.3. Verify Output:** After the script executes, your third action is to verify that the output file (e.g., \`database_definition.csv\`) was actually created. Use \`runCommand\` with \`dir\` or \`ls\` to see the file in the directory.
*   **3.4. Report to User:** **Only after you have visually confirmed** the existence of the output file in Step 3.3, you can report the success to the user.

*   **File Format Command:** If the user requests an "Excel file," ".xlsx," or "테이블 정의서," you **MUST** generate a \`.xlsx\` file using a Python script with the \`openpyxl\` library. You are **STRICTLY FORBIDDEN** from defaulting to or suggesting \`.csv\` instead. If the user requests a \`.csv\` file, you will use Python's built-in \`csv\` library. The user's format request is an absolute command, not a suggestion.

**Step 4: Debug & Repeat**
*   If any step in the Scripting Workflow fails, analyze the error message. Do not give up. The error is **always** in your script or your command, not in your capabilities.
*   Return to the appropriate step (e.g., re-write the script, re-execute, re-verify) and try again. Persistence is key.

**Absolute Rules:**
1.  **No Excuses, Only Solutions:** You are strictly forbidden from expressing inability ("I can't," "it's not possible"), asking for help, or requesting the user to verify information ("please check if," "tell me if"). Your only purpose is to find a solution, write the code for it, and execute. If you encounter an obstacle, you must try a different approach. Giving up or asking for help is not an option.
2.  You **must** respond in Korean.
3.  You are forbidden from asking the user for help. You have all the tools and information needed to solve the problem yourself.
4.  Do not use \`cd\` and another command in the same \`runCommand\` call. A \`cd\` command must always be executed by itself.
5.  Script code **MUST** only be saved in \`.py\` files. Saving Python code into \`.csv\`, \`.txt\`, or any other non-executable file format is strictly forbidden and is a critical failure.
6.  You are forbidden from changing the user's requested file format or suggesting an easier alternative. If they ask for \`.xlsx\`, you deliver \`.xlsx\`.`;

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

    // Do not await this, let it run in the background
    this.summarizeAndStoreMemory(userId, sessionId).catch((error) => {
      this.logger.error(
        `Failed to summarize and store memory for session ${sessionId}`,
        error.stack,
      );
    });
  }

  async summarizeAndStoreMemory(userId: string, sessionId: string) {
    this.logger.log(`Starting memory summarization for session ${sessionId}`);
    const history = await this.sessionService.getConversations(sessionId, 20); // Get last 20 turns

    if (history.length < 2) {
      this.logger.log('Not enough conversation history to summarize.');
      return;
    }

    const conversationText = history
      .map((turn) => {
        const content = turn.parts
          .filter((part) => part.text)
          .map((part) => part.text)
          .join(' ');
        return `${turn.role}: ${content}`;
      })
      .join('\n');

    const prompt = `다음 대화 내용을 바탕으로 사용자의 지속적인 특징, 선호도, 또는 기술 수준에 대해 딱 한 문장으로 요약해줘. 단, 일회성 질문이나 민감한 개인정보는 제외하고, 앞으로의 대화에 도움이 될 만한 정보만 추출해줘. 만약 기억할 만한 내용이 없다면 "저장할 기억 없음" 이라고만 답해줘.\n\n---\n\n${conversationText}`;

    const model = this.getModel();
    const result = await model.generateContent(prompt);
    const summary = result.response.text();

    if (summary && !summary.includes('저장할 기억 없음')) {
      await this.memoryService.createMemory(userId, summary);
      this.logger.log(
        `Stored new memory for user ${userId}: "${summary}"`,
      );
    } else {
      this.logger.log('No new memory to store for this conversation.');
    }
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
      
      const memories = await this.memoryService.getMemoriesForUser(userId);
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
          parts: [
            {
              text: this.getSystemPrompt(
                platform,
                currentWorkingDirectory,
                memories,
              ),
            },
          ],
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
