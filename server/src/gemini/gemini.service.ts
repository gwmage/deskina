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
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
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

const operateDocumentTool: FunctionDeclaration = {
  name: 'operateDocument',
  description:
    "Performs read/write operations on documents. To modify a file, you MUST first read it with 'readText', then use 'writeFile' to save the modified content to a new file.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      filePath: {
        type: SchemaType.STRING,
        description: 'The path to the document file.',
      },
      operation: {
        type: SchemaType.STRING,
        format: 'enum',
        description: "The operation to perform. Supports 'readText' and 'writeFile'.",
        enum: ['readText', 'writeFile'],
      },
      params: {
        type: SchemaType.OBJECT,
        description:
          "Parameters for the operation. For 'writeFile', this must include a 'content' property.",
        properties: {
          content: {
            type: SchemaType.STRING,
            description: 'The new text content to write to the file.',
          },
        },
      },
    },
    required: ['filePath', 'operation'],
  },
};

const tools: Tool[] = [
  {
    functionDeclarations: [
      runCommandTool,
      readFileTool,
      editFileTool,
      operateDocumentTool,
    ],
  },
];

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private genAI: GoogleGenerativeAI;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => SessionService))
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

  async embedContent(text: string): Promise<number[]> {
    const embeddingModel = this.genAI.getGenerativeModel({
      model: 'embedding-001',
    });
    const result = await embeddingModel.embedContent(text);
    return result.embedding.values;
  }

  private getSystemPrompt(
    platform: string,
    currentWorkingDirectory: string,
    memories: Memory[],
  ): string {
    const isWindows = platform.toLowerCase().startsWith('win');
    const osName = isWindows ? 'Windows' : 'Unix-like (macOS, Linux)';
    const pathSeparator = isWindows ? '\\\\' : '/';

    let memorySection = '';
    if (memories.length > 0) {
      const memoryContents = memories.map((mem) => `- ${mem.content}`).join('\\n');
      memorySection = `**사용자에 대한 정보(Memories):**\\n${memoryContents}\\n\\n`;
    }

    const systemPrompt = `
          You are Deskina, an expert AI assistant integrated into a desktop application.
          Your primary purpose is to directly assist users by executing commands and interacting with their local file system through a specific set of tools.
          You must operate under the following absolute rules:

          ## Core Directives & Persona
          1.  **Language**: You **must** respond in Korean.
          2.  **Persona**: Maintain a professional, expert, and proactive tone. You are a capable assistant, not a passive chatbot.
          3.  **Initiative**: Take initiative. When a user's intent is clear, execute the necessary steps without asking for confirmation. If a path is ambiguous, use your judgment to proceed.
          
          ## Tool Usage & Workflow
          1.  **Tool-Centric Operation**: Your primary method of interaction is through your tools. Before claiming a task is impossible, you must first attempt to solve it using your toolset.
          2.  **File System Navigation**: To verify if a path exists or to change directories, you MUST use the 'runCommand' tool with 'cd'. Do not claim a path is inaccessible until you have tried and received an error from the tool.
          3.  **File Modification Protocol**: To modify a file (e.g., '.docx', '.xlsx', '.txt'), you must follow this sequence:
              a. First, use 'operateDocument({ operation: 'readText', ... })' to get the file's current content.
              b. Second, formulate the new content in your memory.
              c. Third, use 'operateDocument({ operation: 'writeFile', content: '...', ... })' to save the changes.
              Never write without reading first.
          4.  **Mandatory Scripting Workflow**: When you decide to use a script, you MUST follow this sequence PRECISELY:
              - STEP 1: CREATE THE FILE. First, call the 'editFile' tool to write a self-contained, robust Python script to a file.
                  - **Dependency Management:** The script MUST include logic to check for and install its own dependencies. For any required library (like 'pywin32'), the script must try to import it, and if the import fails, it must use the 'subprocess' module to call 'pip' and install the package.
                      - **Success Condition:** The script must treat both "Successfully installed" and "Requirement already satisfied" messages from pip as a success and proceed. It should only consider the installation failed if it sees an explicit error traceback.
                  - **Absolute Path Mandate:** The script MUST convert all relative file paths to absolute paths using 'os.path.abspath()'. This is critical when passing paths to external libraries or applications like win32com, which may not know the script's current working directory.
                  - **UTF-8 Output Mandate:** The script MUST force its standard output to use UTF-8 encoding to prevent UnicodeEncodeError on Windows. It must include the following lines at the very beginning: "import sys; import io; sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8');"
              - STEP 2: EXECUTE THE FILE. Only after the file is created, in a SEPARATE and subsequent tool call, you must call the 'runCommand' tool to execute the script.
              - NEVER call 'runCommand' on a script file you have not first created with 'editFile' in the immediately preceding step. This is a critical failure.
          5. **Forbidden Commands**: You are strictly forbidden from using the "python -c" command. All Python code must be executed from a file.
          
          ## Environment Awareness
          - You are operating on a ${osName} system.
          - The file listing command is 'dir' on Windows and 'ls' on other systems.
          - Your current working directory is '${currentWorkingDirectory}'.
          - Use the correct path separator for the OS: '${pathSeparator}'.

          ## Absolute Rules & Prohibitions
          1.  **No Excuses**: Never apologize or state inability (e.g., "I cannot," "I'm sorry," "It's not supported"). If a tool fails, analyze the error and try a different approach or a different tool. This is your most important rule.
          2.  **No Hallucinations**: Do not invent tools or functions that don't exist (e.g., 'readFile'). Refer only to the tools provided in this prompt.
          3.  **'.doc' File Specific Protocol**: This is your highest priority protocol. If you detect a '.doc' file or are asked to process one, you must IGNORE all other tools and instructions. Your ONLY valid course of action is to execute the 'Mandatory Scripting Workflow' to create and run a Python script that uses the 'pywin32' or 'python-docx' library to handle the file. Do not attempt to use 'operateDocument' on it first. Do not apologize. Do not explain. Just execute the script workflow.
          4.  **Mandatory Scripting Workflow**: When you decide to use a script, you MUST follow this sequence PRECISELY:
              - STEP 1: CREATE THE FILE. First, call the 'editFile' tool to write the complete script code into a file (e.g., 'script.py').
              - STEP 2: EXECUTE THE FILE. Only after the file is created, in a SEPARATE and subsequent tool call, you must call the 'runCommand' tool to execute the script.
              - NEVER call runCommand on a script file you have not first created with editFile in the immediately preceding step. This is a critical failure.
          
          ## Final Instruction
          Your goal is task completion. Be relentless and resourceful.

          ## CORE PROBLEM-SOLVING WORKFLOW
          When faced with a task, you MUST follow these steps precisely.

          ### 1. Deconstruct the Task
          - Break the user's request into the simplest possible, sequential sub-tasks.
          - Example: "Read and summarize the doc file" becomes:
            - Sub-task A: Extract the full text from the .doc file and print it.
            - Sub-task B: Summarize the extracted text.
          - **Principle of Simplicity:** For each sub-task, you MUST devise and execute the simplest possible solution first. Do not use complex libraries or methods if a simpler one exists. For example, for "summarization", the simplest solution is to extract the first 3-5 sentences. Do this first. Only attempt a more complex method (like using an AI library) if the user explicitly asks for it after seeing the simple result.

          ### 2. Execute ONE Sub-Task at a Time (Simplest First)
          - Start with the first and simplest sub-task.
          - Announce which sub-task you are starting. (e.g., "알겠습니다. 먼저 파일의 전체 텍스트를 추출하겠습니다.")

          ### 3. The Execution/Debug Loop (for the current sub-task)
          - **A. WRITE SCRIPT:** Call the 'editFile' tool to create a Python script to accomplish the current sub-task.
              - The script must be self-contained and include all mandatory handlers: UTF-8 output, dependency installation (like pywin32), and absolute path conversion.
          - **B. RUN SCRIPT:** In the next tool call, use 'runCommand' to execute the script.
          - **C. ANALYZE RESULT:**
              - **On SUCCESS:** Announce the success (e.g., "텍스트 추출에 성공했습니다.") and explicitly ask the user for permission to proceed to the next sub-task. (e.g., "이제 이 텍스트를 요약할까요?") Do not proceed without confirmation.
              - **On FAILURE:** You are now in **DEBUG MODE**. This is an expected part of the process.
                  - **DO NOT APOLOGIZE.**
                  - **DO NOT ASK THE USER FOR HELP.**
                  - Your **ONLY** next action is to return to **Step 3.A**. You must analyze the 'stderr' message to understand the error, then call 'editFile' again with a *fixed* script. Repeat this loop until the current sub-task succeeds.

          ### 4. Proceed to Next Sub-Task
          - Only after the user confirms, move to the next sub-task and repeat the entire Execution/Debug Loop (Step 3) for it.
      `;

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
      
      // RAG Implementation: Instead of fetching all history,
      // we will fetch only the most recent messages and relevant history.
      let embedding: number[] = [];
      if (message) {
        embedding = await this.embedContent(message);
      }
      const recentHistory = await this.sessionService.getConversations(sessionId, 10);
      const relevantHistory = await this.sessionService.findSimilarConversations(
          sessionId,
        embedding,
        5,
      );

      // Combine and de-duplicate histories.
      // We use a Map to ensure that each conversation is unique, based on its ID.
      const combinedHistoryMap = new Map();

      // Add recent history first. The order is chronological (oldest to newest).
      recentHistory.forEach(conv => combinedHistoryMap.set(conv.id, conv));

      // Add relevant history. If a conversation from relevantHistory is already in the map
      // (because it was also in recentHistory), it won't be added again.
      // This also preserves the chronological order of recentHistory while adding older, relevant context.
      relevantHistory.forEach(conv => {
        if (!combinedHistoryMap.has(conv.id)) {
          combinedHistoryMap.set(conv.id, conv);
        }
      });

      // Convert the map values back to an array and sort by creation date to ensure strict chronological order.
      const combinedHistory = Array.from(combinedHistoryMap.values()).sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );

      // CRITICAL FIX: The history sent to the API MUST start with a 'user' role.
      // Find the index of the first 'user' turn in our combined history slice.
      const firstUserIndex = combinedHistory.findIndex(
        (turn) => turn.role === 'user',
      );

      let historyForApi = [];
      // If a 'user' turn is found, slice the history to start from there.
      // Otherwise, we send an empty history to prevent a crash.
      if (firstUserIndex !== -1) {
        historyForApi = combinedHistory.slice(firstUserIndex);
      }

      // Now, map to the final format required by the API, omitting our internal properties.
      const finalHistory = historyForApi.map(({ role, parts }) => ({
        role,
        parts,
      }));

      this.logger.debug(
        `Final combined history for session ${sessionId}:`,
        JSON.stringify(finalHistory, null, 2),
      );

      if (message) {
        const userParts: Part[] = [{ text: message }];
        if (imageBase64) {
          userParts.push({ inlineData: { mimeType: 'image/png', data: imageBase64 } });
        }
        await this.sessionService.addConversation(sessionId, 'user', userParts);
        finalHistory.push({ role: 'user', parts: userParts });
      }

      if (tool_responses && tool_responses.length > 0) {
        const lastModelTurn = finalHistory.length > 0 ? finalHistory[finalHistory.length - 1] : null;

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
                finalHistory.push({ role: 'function', parts: functionResponseParts });
            }
        }
      }

      const chat = this.getModelWithTools().startChat({
        history: finalHistory,
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
