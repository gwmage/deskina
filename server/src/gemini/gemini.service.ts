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

    const osSpecifics = {
      fileSearchCommand: isWindows ? 'dir /s /b' : 'find . -name',
    };

    const examples = isWindows
      ? `  - List files: \`dir\`\n  - Find files: \`dir /s /b "FILENAME"\`\n  - Read file: \`type "FILEPATH"\`\n  - Check current directory: \`cd\` or \`echo %cd%\``
      : `  - List files: \`ls -l\`\n  - Find files: \`find . -name "FILENAME"\`\n  - Read file: \`cat "FILEPATH"\`\n  - Check current directory: \`pwd\``;

    return `You are "Deskina," a hyper-competent AI agent. Your primary mission is to solve user requests by creating a plan, executing it with tools, and delivering a final answer.

**CONTEXT:**
- **Operating System:** You are on **${osName}**. You MUST use commands for this environment.
- **Current Directory:** \`${currentWorkingDirectory}\`
- **Command Examples for ${osName}:**
${examples}

**GENERAL WORKFLOW & CRITICAL RULES:**

1.  **CRITICAL FIRST STEP: ALWAYS FIND THE FILE.**
    *   If the user asks to read, analyze, edit, summarize, or otherwise interact with a file, your **FIRST and ONLY initial action MUST be to find its full path.**
    *   To do this, use the file search command: \`runCommand({ command: '${osSpecifics.fileSearchCommand}', args: ['FILENAME'] })\`
    *   **EXAMPLE:** User says "analyze App.js". Your first action **MUST** be \`runCommand({ command: '${osSpecifics.fileSearchCommand}', args: ['App.js'] })\`.
    *   **NEVER, EVER ask the user for a file path.** Find it yourself. This is your most important instruction.

2.  **CHAIN TOOLS: USE THE OUTPUT AS YOUR NEXT INPUT.** The result from one tool is your context for your next action.
    *   When a tool like \`runCommand\` or \`readFile\` returns, you will receive its result in a JSON object: \`{ "output": "..." }\`.
    *   You **MUST** extract the value from the "output" field and use it in your next step.
    *   **CORRECT WORKFLOW EXAMPLE for "analyze App.js":**
        1.  Your turn: \`runCommand({ command: '${osSpecifics.fileSearchCommand}', args: ['App.js'] })\`
        2.  Tool result you get: \`{ "output": "C:\\Users\\user\\project\\client\\src\\App.js\\n" }\`
        3.  Your **NEXT** turn **MUST** be: \`readFile({ filePath: "C:\\Users\\user\\project\\client\\src\\App.js" })\` (Note: You must use the clean path from the "output" field).
    *   **INCORRECT WORKFLOW:** Receiving a tool result and then asking the user what to do. This is a critical failure. **Never do this.**

3.  **HANDLING EMPTY RESULTS:**
    *   If you run a command like \`cd C:\\some\\path\` and get an empty result like \`{ "output": "" }\` or \`{ "output": "Command executed successfully with no output." }\`, this is **SUCCESS**.
    *   It means the directory changed. Do not ask the user about it. Your **NEXT** turn should be to continue with your plan (e.g., finding a file in that new directory).

4.  **SELF-CORRECT ON FAILURE.** If a tool call fails, do not give up.
    *   **Wrong OS Command?** Immediately try the correct command for **${osName}**.
    *   **File Not Found?** Your path is likely wrong. Immediately use the file search command (\`${osSpecifics.fileSearchCommand}\`) to find the full, correct path and try again.
    *   **Do not report correctable errors to the user.** Solve them yourself.

5.  **ANSWER: REPORT THE FINAL RESULT.** Once you have successfully executed all steps in your plan and have the information needed to satisfy the user's original request, your final response **MUST** be a user-friendly text summary in Korean.`;
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

    const result =
      initialParts.length > 0
        ? await chat.sendMessageStream(initialParts)
        : await chat.sendMessageStream('');

    let fullResponseText = '';
    
    // 텍스트를 클라이언트에 스트리밍합니다.
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        fullResponseText += chunkText;
        res.write(
          `data: ${JSON.stringify({ type: 'text_chunk', payload: chunkText })}\n\n`,
        );
      }
    }
    
    // 스트림이 완전히 끝난 후, 최종 응답에서 함수 호출을 확인합니다.
    const finalResponse = await result.response;
    const functionCalls = finalResponse.functionCalls();

    if (functionCalls && functionCalls.length > 0) {
      // 함수 호출이 있으면, DB에 저장하고 클라이언트에 'action' 이벤트를 보냅니다.
      // 여러 개의 함수 호출을 모두 처리하도록 수정합니다.
      await this.sessionService.addConversation(
        sessionId,
        'model',
        JSON.stringify({ functionCalls: functionCalls }), // DB에는 전체 배열 저장
      );
      
      for (const call of functionCalls) {
        res.write(`data: ${JSON.stringify({ type: 'action', payload: call })}\n\n`);
      }

    } else if (fullResponseText.trim()) {
      // 텍스트 응답만 있었을 경우, DB에 저장합니다.
      // 클라이언트는 이미 text_chunk로 내용을 받았으므로 추가 전송은 필요 없습니다.
      await this.sessionService.addConversation(
        sessionId,
        'model',
        fullResponseText,
      );
    }
    
    // 대화 턴의 종료를 알립니다.
    res.write(`data: ${JSON.stringify({ type: 'final', payload: {} })}\n\n`);
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

      // const rawHistory = await this.sessionService.getConversations(sessionId);
      const history = await this.sessionService.getConversations(sessionId);
      
      // const history = rawHistory
      //   .map((h: any) => { // Use 'any' to bypass strict type-checking on mapped history
      //     if (h.role === 'model' && h.parts && h.parts[0]?.text) {
      //       try {
      //         const parsed = JSON.parse(h.parts[0].text);
      //         if (parsed.action && parsed.parameters) {
      //           return {
      //             role: 'model',
      //             parts: [{ functionCall: { name: parsed.action, args: parsed.parameters } }],
      //           };
      //         }
      //         // This was the bug: It was removing tool results from history.
      //         // Now we will correctly parse them into functionResponses.
      //         if (parsed.type === 'action_result' && parsed.content) {
      //           const previousTurn = rawHistory[rawHistory.findIndex((item: any) => item.id === h.id) - 1];
      //           if (previousTurn && previousTurn.role === 'model' && previousTurn.parts[0]?.text) {
      //             const prevParsed = JSON.parse(previousTurn.parts[0].text);
      //             if (prevParsed.action) {
      //               return {
      //                 role: 'function',
      //                 parts: [{
      //                   functionResponse: {
      //                     name: prevParsed.action,
      //                     response: { output: parsed.content },
      //                   },
      //                 }],
      //               };
      //             }
      //           }
      //         }
      //       } catch (e) {}
      //     }
      //     // The Gemini API expects 'tool' for the role of a function response, not 'model'.
      //     if (h.role === 'function') {
      //       return { ...h, role: 'tool' };
      //     }
      //     return h;
      //   })
      //   .filter(Boolean);

      let partsForAI: Part[] = [];

      if (message) {
        await this.sessionService.addConversation(
          sessionId,
          'user',
          message,
          imageBase64,
        );
        partsForAI.push({ text: message });
        if (imageBase64) {
          partsForAI.push(this.convertBase64ToPart(imageBase64, 'image/png'));
        }
      } else if (tool_responses && tool_responses.length > 0) {
        for (const tool_response of tool_responses) {
          const result = tool_response.result;

          // 클라이언트가 보낸 원본 결과 객체를 DB에 저장합니다.
          await this.sessionService.addConversation(
            sessionId,
            'function',
            JSON.stringify(result),
          );

          // AI가 이해할 수 있는 { output: '...' } 형식으로 변환합니다.
          const output = result.success
            ? result.stdout ||
              result.content ||
              'Command executed successfully with no output.'
            : `Error: ${
                result.stderr ||
                result.error ||
                'Command failed with no error message.'
              }`;

          partsForAI.push({
            functionResponse: {
              name: tool_response.name,
              response: { output },
            },
          });
        }
      }

      const chat = this.getModelWithTools().startChat({
        history: history,
        systemInstruction: {
          role: 'user',
          parts: [
            {
              text: `You are "Deskina," a hyper-competent AI agent. Your primary mission is to solve user requests by creating a plan, executing it with tools, and delivering a final answer.

**CONTEXT:**
- **Operating System:** You are on **${
            platform || 'Windows'
          }**. You MUST use commands for this environment.
- **Current Directory:** \`${currentWorkingDirectory.replace(/\\/g, '\\\\')}\`

**CRITICAL RULES:**

1.  **Directory Navigation (\`cd\`) is Your Job:**
    *   To navigate the file system, directly use the \`runCommand({ command: 'cd', args: ['TARGET_DIRECTORY'] })\` tool.
    *   **DO NOT** check if a directory exists with \`dir\` before changing to it. Just attempt the \`cd\` command.
    *   The system automatically handles the directory change. You don't need to confirm it. If it fails, the system will tell you.

2.  **Tool Chaining & Self-Correction:**
    *   Use the output from one tool as the input for your next action.
    *   If a tool call fails, analyze the error and try to correct it. For example, if a file is not found, use a file search command (\`dir /s /b "FILENAME"\` on Windows) to find the correct path and retry.
    *   Do not report correctable errors to the user. Solve them yourself.

3.  **Final Answer:**
    *   Once all steps are complete, provide a user-friendly summary in Korean.
`,
            },
          ],
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
