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

  private getSystemPrompt(relevantHistory: string): string {
    return `You are a machine that converts a user request into a single, structured JSON object.

**RULES (NO EXCEPTIONS):**
1.  **STRUCTURED CONTENT IS REQUIRED:** For the \`reply\` tool, you MUST structure the output in the \`parameters.content\` array. Each item in the array must be an object with a "type" ('text' or 'code') and a "value". For "code" items, you MUST also include a "language". This is the most important rule.
2.  **JSON ONLY:** Your entire output MUST be a single JSON object.
3.  **LANGUAGE:** Text values must be in the same language as the user's last message.

<CONVERSATION_HISTORY>
${relevantHistory}
</CONVERSATION_HISTORY>

**TOOLS:**
- \`reply\`: To answer questions. Its "parameters" must contain a "content" array.
- \`runCommand\`: To execute commands.

**PERFECT RESPONSE EXAMPLE (KOREAN):**
{
  "action": "reply",
  "parameters": {
    "content": [
      { "type": "text", "value": "요청하신 Nginx 설치 명령어입니다." },
      { "type": "code", "language": "bash", "value": "sudo apt update\\nsudo apt install nginx" },
      { "type": "text", "value": "설치 후 상태를 확인하세요." }
    ]
  }
}`;
  }

  async *generateStream(
    userId: string,
    prompt: string,
    sessionId?: string,
    imageBase64?: string,
  ): AsyncGenerator<any> {
    this.logger.debug(`Streaming for prompt: "${prompt}" in session: ${sessionId} by user: ${userId}`);

    let currentSessionId = sessionId;

    // If no session ID is provided, create a new session.
    if (!currentSessionId) {
      const newSession = await this.sessionService.create(prompt, userId); // Pass userId here
      currentSessionId = newSession.id;
      this.logger.debug(`Created new session with ID: ${currentSessionId} for user: ${userId}`);
      // Yield a special event to inform the client about the new session ID
      yield { data: { type: 'session_id', payload: currentSessionId } };
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

    const systemPrompt = this.getSystemPrompt(relevantHistoryText);
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

    const streamResult = await this.genAI.models.generateContentStream({
      model: 'gemini-1.5-flash-latest',
      contents: [{ role: 'user', parts: currentUserParts }],
    });
    
    let completeResponse = '';
    for await (const chunk of streamResult) {
      completeResponse += chunk.text;
    }

    this.logger.debug(`Full stream response: ${completeResponse}`);

    let agentAction: AgentAction;
    try {
      const cleanedJson = completeResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      agentAction = JSON.parse(cleanedJson);
    } catch (e) {
      this.logger.warn("Streamed response was not valid JSON. Replying with raw text.", e);
      agentAction = { action: 'reply', parameters: { text: completeResponse } };
    }

    if (agentAction.action === 'reply' && agentAction.parameters.text) {
      const textToStream = agentAction.parameters.text;
      for (const char of textToStream.split('')) {
          yield { data: { type: 'chunk', payload: char } };
          await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    await this.vectorStore.addConversation(
      currentSessionId,
      'model',
      JSON.stringify(agentAction),
    );

    yield { data: { type: 'final', payload: agentAction } };
  }
}
