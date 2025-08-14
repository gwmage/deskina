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
    "Reads and writes files of various types (.txt, .js, .py, .docx, .xlsx, etc.).",
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

  private async classifyIntent(userMessage: string, sessionHistory: any[]): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

    const formattedHistory = sessionHistory
      .slice(-4) // Use last 4 turns for context
      .map(turn => `${turn.role}: "${turn.parts.map(p => p.text || '').join(' ')}"`)
      .join('\n');

    const prompt = `
      Analyze the user's latest message in the context of the recent conversation history to determine their primary intent. 
      Your response MUST be only one of the following category names.

      **Conversation History:**
      ${formattedHistory}

      **User's Latest Message:** "${userMessage}"

      **Categories:**
      - **path_navigation**: The user wants to change directories, list files, or interact with the file system. This is likely if the user repeats a command after a failure or clarifies a previous path-related instruction.
      - **document_read**: The user wants to see the contents of a specific file.
      - **document_edit**: The user wants to create a new file or modify an existing one.
      - **scripting_and_debug**: The user needs to generate and execute code to solve a problem.
      - **general_conversation**: For general questions or any request that doesn't fit the other categories.

      **Intent:**
    `;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const intent = response.text().trim();
      const validIntents = ['path_navigation', 'document_read', 'document_edit', 'scripting_and_debug', 'general_conversation'];
      if (validIntents.includes(intent)) {
        this.logger.log(`[Intent Classifier] Classified intent as: ${intent}`);
        return intent;
      } else {
        this.logger.warn(`[Intent Classifier] Could not classify reliably, defaulting to general_conversation. Classified as: ${intent}`);
        return 'general_conversation';
      }
    } catch (error) {
      this.logger.error('[Intent Classifier] Error in intent classification:', error);
      return 'general_conversation';
    }
  }

  private getSystemPrompt(
    intent: string,
    platform: string,
    currentWorkingDirectory: string,
    memories: Memory[],
  ): string {
    const isWindows = platform.toLowerCase().startsWith('win');
    const osName = isWindows ? 'Windows' : 'Unix-like (macOS, Linux)';
    const listCommand = isWindows ? 'dir' : 'ls';

    let memorySection = '';
    // Only add memories if the intent is general or requires deeper context.
    const intentsWithMemory = ['general_conversation', 'scripting_and_debug'];
    if (intentsWithMemory.includes(intent) && memories.length > 0) {
      const memoryContents = memories.map((mem) => `- ${mem.content}`).join('\n');
      memorySection = `## User Memory\n${memoryContents}\n\n`;
    }

    const baseInfo = `
      You are a specialized AI assistant. Your ONLY job is to execute the user's request using your tools.
      - **Language**: Respond ONLY in Korean.
      - **Environment**: You are on a ${osName} system. Your CWD is '${currentWorkingDirectory}'.
      - **Critical Rule**: NEVER say you "cannot" or "it's impossible" to do something. If you cannot perform a task with your primary tools, you MUST fall back to generating a Python script. Announce this by saying, "알겠습니다. 요청하신 작업을 파이썬 스크립트로 처리하겠습니다."
      ${memorySection}
    `;

    switch (intent) {
      case 'path_navigation':
        return baseInfo + `
          ## ALGORITHM: File System Navigation

          **INPUT:** User provides a directory path, \`TARGET_PATH\`.

          **PROCEDURE:**
          1.  IMMEDIATELY generate the following tool call, and nothing else:
              \`runCommand({ command: 'cd', args: [TARGET_PATH] })\`
          2.  AWAIT the result from the tool.
          3.  IF the tool result is SUCCESS:
              - Your next response MUST be a tool call to list the contents:
                \`runCommand({ command: '${listCommand}' })\`
          4.  IF the tool result is FAILURE:
              - Your next response MUST be a simple report of the error message from the tool.

          **RULES:**
          - DO NOT analyze \`TARGET_PATH\` before execution.
          - DO NOT ask for clarification.
          - DO NOT apologize.
          - DO NOT make excuses about permissions.
          - Your ONLY function is to execute this algorithm.
        `;
      
      case 'document_read':
        return baseInfo + `
          ## Your Role: File Reader
          Your entire purpose is to read file contents for the user.

          ### Workflow
          1.  **Analyze the user's request for a file path.**
          2.  **If a specific file path is provided** (e.g., "read my_file.txt"):
              - Your FIRST and ONLY action is to call \`operateDocument({ operation: 'readText', filePath: 'my_file.txt' })\`.
          3.  **If the file path is ambiguous or not provided** (e.g., "analyze the doc file"):
              - Your FIRST action is to list the files in the current directory to find the target. Call \`runCommand({ command: '${listCommand}' })\`.
              - After listing the files, ask the user to clarify which file they want to read.
          4.  **After reading the file successfully** via \`operateDocument\`:
              - Show the full, unmodified content to the user.
          5.  **If any step fails** (e.g., \`operateDocument\` returns an error):
              - Immediately fall back to the 'scripting_and_debug' workflow to solve the problem with Python. Do not apologize or state that you failed.
        `;

      case 'document_edit':
         return baseInfo + `
          ## Your Role: File Editor
          Your entire purpose is to create or overwrite files with new content.

          ### Workflow
          1.  The user gives a command like "create file XXX.py with content '...'"
          2.  Your FIRST and ONLY action is to call \`editFile({ filePath: 'XXX.py', newContent: '...' })\`.
          3.  When the tool result returns, confirm to the user whether the file was successfully written or not.
          4.  If FAILED: Immediately fall back to the 'scripting_and_debug' workflow.
        `;

      case 'scripting_and_debug':
        return baseInfo + `
          ## Your Role: Scripting & Debugging Expert
          Your entire purpose is to solve complex problems by writing, executing, and debugging Python scripts.

          ### CORE PROBLEM-SOLVING WORKFLOW
          You must follow these steps precisely.
          1. **Deconstruct**: Break the user's task into the simplest possible sub-tasks.
          2. **Execute Simplest First**: Announce and execute the simplest sub-task first.
          3. **Execution/Debug Loop**:
              - **A. WRITE SCRIPT**: Use 'editFile' to create a Python script with all mandatory handlers (UTF-8, dependency install, absolute paths).
              - **B. RUN SCRIPT**: Use 'runCommand' to execute it.
              - **C. ANALYZE RESULT**: 
                  - **On SUCCESS**: Announce success and ask to proceed to the next sub-task.
                  - **On FAILURE (DEBUG MODE)**: DO NOT apologize or ask for help. Analyze the error and go back to step A to create a *fixed* script. Repeat this loop until the sub-task succeeds.
        `;

      default: // general_conversation
        return baseInfo + `
          ## Your Role: General Assistant
          Your purpose is to have a helpful conversation.

          ### Workflow
          1. Answer general questions and provide information.
          2. **CRITICAL SAFETY NET**: If the user's request, despite the classification, seems to be a command for a tool (like file navigation or reading), you MUST re-evaluate and attempt to use the appropriate tool. Do not simply state you cannot do it.
        `;
    }
  }

  private convertBase64ToPart(base64: string, mimeType: string): Part {
    return { inlineData: { data: base64, mimeType } };
  }

  private async executeAndRespond(
    res: Response,
    userId: string,
    sessionId: string,
    chat: any,
    userMessage: string | undefined,
    intent: string,
  ) {
    const stream = await chat.sendMessageStream(userMessage || '');
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
    if (intent === 'general_conversation') {
      this.summarizeAndStoreMemory(userId, sessionId).catch((error) => {
        this.logger.error(
          `Failed to summarize and store memory for session ${sessionId}`,
          error.stack,
        );
      });
    }
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

      const intent = message
        ? await this.classifyIntent(message, combinedHistory)
        : 'general_conversation';

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
          role: 'model',
          parts: [{ text: this.getSystemPrompt(intent, platform, currentWorkingDirectory, memories) }],
        },
      });
      await this.executeAndRespond(res, userId, sessionId, chat, message, intent);

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
