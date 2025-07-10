import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Part, Content, GenerationConfig, GenerateContentResponse } from '@google/genai';
import { VectorStoreService } from './vector-store.service';
import { SessionService } from '../session/session.service'; // Import SessionService
import { AgentAction } from './agent.service';
import { Observable } from 'rxjs';

@Injectable()
export class GeminiService implements OnModuleInit {
  private readonly logger = new Logger(GeminiService.name);
  private genAI: GoogleGenAI;
  private generationConfig: GenerationConfig;

  constructor(
    private configService: ConfigService,
    private vectorStore: VectorStoreService,
    private sessionService: SessionService, // Inject SessionService
  ) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    // Correctly initialize with the API key as an object property
    this.genAI = new GoogleGenAI({ apiKey });
    this.generationConfig = {
      temperature: 0.2,
      responseMimeType: 'application/json',
    };
  }

  private getSystemPrompt(relevantHistory: string, platform: string): string {
    return `You are Deskina, a friendly and capable AI assistant with a sense of humor. You are running on the user's operating system: **${platform}**.

**PERSONALITY:**
1.  **Be Friendly & Engaging:** Use a warm and conversational tone.
2.  **Use Emojis:** Sprinkle relevant emojis (like ✨, 🤖, 🚀) into your text responses to make them more lively and fun!
3.  **Be a Helper:** Your goal is to be genuinely helpful and make the user's task easier.

**TECHNICAL RULES (NO EXCEPTIONS):**
1.  **OS-AWARE COMMANDS:** You MUST generate commands compatible with the user's OS (${platform}).
    - For Windows (Win32), use commands like \`dir\`, \`type\`, \`echo\`.
    - For macOS (MacIntel) or Linux, use commands like \`ls\`, \`cat\`, \`echo\`.
2.  **STRUCTURED CONTENT IS REQUIRED:** You MUST respond with a JSON array of "actions".
3.  **SEQUENTIAL ACTIONS:** The actions in the array will be executed sequentially by the system.
4.  **STOP AFTER COMMAND:** If you use the \`runCommand\` tool, it MUST be the LAST action in your response array.
5.  **ERROR HANDLING:** When you receive a \`TOOL_OUTPUT\` message indicating a command has failed, your ONLY next step is to use the \`reply\` action to inform the user about the error and ask for what to do next. Do NOT try the same command or another command.
6.  **JSON ONLY:** Your entire output MUST be a single, valid JSON array.
7.  **LANGUAGE:** Text values in 'reply' actions must be in the same language as the user's last message.

<CONVERSATION_HISTORY>
${relevantHistory}
</CONVERSATION_HISTORY>

**HOW TO USE TOOLS:**
- When the user asks for something that requires running a command, first \`reply\` to confirm, then use \`runCommand\` as the final action.
- When you are given a \`TOOL_OUTPUT\` from the system, analyze the result.
  - If it was successful, use \`reply\` to present the results to the user.
  - If it failed, use \`reply\` to explain the error and ask for guidance.

**TOOLS / ACTIONS:**
- \`reply\`: Use this to send text or code back to the user.
  - \`parameters\`:
    - \`content\`: An array of objects, each with \`type\` ('text' or 'code') and \`value\`.
- \`runCommand\`: Use this to execute a shell command on the user's OS. After this action, your turn ends.
  - \`parameters\`:
    - \`command\`: The command to execute (e.g., 'ls', 'cat', 'rm').
    - \`args\`: An array of string arguments for the command.

**PERFECT RESPONSE EXAMPLE (KOREAN):**
\`\`\`
// User asks to list files on Windows.
[
  {
    "action": "reply",
    "parameters": {
      "content": [
        { "type": "text", "value": "물론이죠! 현재 디렉토리의 파일 목록을 보여드릴게요. 🤖" }
      ]
    }
  },
  {
    "action": "runCommand",
    "parameters": {
      "command": "dir",
      "args": []
    }
  }
]
// AI's turn ends here. The system will run the command and feed the result back to the AI.
// The AI will then receive a message like:
// user: TOOL_OUTPUT:
// Command: dir
// Status: Success
// Output:
// C:\Users\Test
// file1.txt
// file2.txt
// ...
\`\`\`
`;
  }

  async *generateStream(
    userId: string,
    prompt: string,
    sessionId?: string,
    imageBase64?: string,
    platform: string = 'unknown',
  ): AsyncGenerator<any> {
    this.logger.debug(`Streaming for prompt: "${prompt}" in session: ${sessionId} by user: ${userId} on platform: ${platform}`);

    let currentSessionId = sessionId;

    // If no session ID is provided, create a new session.
    if (!currentSessionId) {
      const newSession = await this.sessionService.create(prompt, userId); // Pass userId here
      currentSessionId = newSession.id;
      this.logger.debug(`Created new session with ID: ${currentSessionId} for user: ${userId}`);
      // Yield a special event to inform the client about the new session ID
      yield { type: 'session_id', payload: currentSessionId };
    }

    await this.vectorStore.addConversation(
      currentSessionId,
      'user',
      prompt,
    );

    const relevantConversations =
      await this.vectorStore.findRelevantConversations(currentSessionId, prompt);
    const relevantHistoryText =
      relevantConversations.length > 0
        ? relevantConversations
            .map((conv) => `${conv.role}: ${conv.content}`)
            .join('\n')
        : 'No relevant history found.';

    const systemPrompt = this.getSystemPrompt(relevantHistoryText, platform);
    const currentUserParts: Part[] = [
      { text: systemPrompt },
      { text: `\n\nCURRENT REQUEST: ${prompt}` },
    ];

    if (imageBase64) {
      this.logger.debug('Adding image part to the prompt.');
      currentUserParts.push({
        inlineData: { mimeType: 'image/png', data: imageBase64 },
      });
    }

    let streamResult;
    try {
      streamResult = await this.genAI.models.generateContentStream({
        model: 'gemini-1.5-flash-latest',
        contents: [{ role: 'user', parts: currentUserParts }],
      });
    } catch (error) {
        this.logger.error('Error calling Google GenAI', error);
        // Re-throw the error to be caught by the controller
        throw error;
    }
    
    let completeResponse = '';
    for await (const chunk of streamResult) {
      completeResponse += chunk.text;
    }

    this.logger.debug(`Full stream response: ${completeResponse}`);

    let agentActions: AgentAction[];
    try {
      // Clean up potential markdown formatting issues
      const cleanedJson = completeResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      agentActions = JSON.parse(cleanedJson);
    } catch (e) {
      this.logger.error("Failed to parse agent actions from LLM response.", { error: e, response: completeResponse });
      // If parsing fails, create a user-friendly error message as a reply action
      agentActions = [{
        action: 'reply',
        parameters: {
          content: [{
            type: 'text',
            value: `죄송해요, AI 응답을 처리하는 중에 오류가 발생했어요. 🤖\n받은 응답: ${completeResponse}`
          }]
        }
      }];
    }
    
    // Process all actions sequentially
    for (const agentAction of agentActions) {
      if (agentAction.action === 'reply' && Array.isArray(agentAction.parameters.content)) {
        for (const item of agentAction.parameters.content) {
          if (item.type === 'text') {
            for (const char of item.value.split('')) {
              yield { type: 'text_chunk', payload: char };
              await new Promise(resolve => setTimeout(resolve, 5)); // Small delay for typing effect
            }
          } else if (item.type === 'code') {
            yield { type: 'code_chunk', payload: item };
          }
        }
      } else if (agentAction.action === 'runCommand') {
        // Yield the entire command action to the client for execution
        yield { type: 'command_exec', payload: agentAction.parameters };
      }
    }
    
    // Save the entire sequence of actions to the conversation history
    await this.vectorStore.addConversation(
      currentSessionId,
      'model',
      JSON.stringify(agentActions),
    );

    // Signal the end of all actions
    yield { type: 'final', payload: agentActions };
  }
}
