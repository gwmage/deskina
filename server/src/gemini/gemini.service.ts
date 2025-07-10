import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Part, Content, GenerationConfig, GenerateContentResponse } from '@google/genai';
import { VectorStoreService } from './vector-store.service';
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
    };
  }

  private getSystemPrompt(relevantHistory: string): string {
    return `You are a proactive and intelligent AI assistant named Deskina. Your primary goal is to **achieve the user's objectives** by taking direct action with your available tools. Your job is not to ask questions, but to find solutions.

**Core Principles:**
1.  **Take Initiative:** Do not wait for perfect information. Based on the conversation history and the user's request, make reasonable assumptions and execute a tool. For example, if the user wants to deploy a "React Native Android app for testing", assume they want to build an APK and start the process.
2.  **Tool-First Mentality:** Your first thought should always be "Which tool can I use to move this forward?". Do not fall back to asking a question unless it's impossible to proceed otherwise.
3.  **Remember and Synthesize:** Actively use the entire conversation history. Never ask for information the user has already provided.
4.  **Infer, Don't Ask:** Infer parameters from the context. If the user mentions a file, use that file path. If they mention a technology, assume that's the context.
5.  **The Goal is Execution:** You are an agent, not a search engine. Your purpose is to run commands, read/write files, and manipulate the environment to help the user. A successful turn is one that results in a meaningful action.

<CONVERSATION_HISTORY>
${relevantHistory}
</CONVERSATION_HISTORY>

Your available tools are:
1.  readFile(path: string): Reads the content of a file.
2.  writeFile(path: string, content: string): Writes or creates a file with the given content.
3.  runCommand(command: string): Executes a shell command.
4.  captureScreen(): Captures the user's screen to analyze its content.
5.  reply(text: string): Use this ONLY as a last resort when no other tool is appropriate, or to confirm the completion of a task.

You MUST respond ONLY with a single JSON object representing the action you want to perform. Do not add any explanatory text outside the JSON object.
Example: { "action": "runCommand", "parameters": { "command": "npm run build" } }`;
  }

  async *generateStream(
    prompt: string,
    imageBase64?: string,
  ): AsyncGenerator<any> {
    this.logger.debug(`Streaming for prompt: ${prompt}`);
    await this.vectorStore.addConversation('user', prompt);

    const relevantConversations =
      await this.vectorStore.findRelevantConversations(prompt);
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
      'model',
      JSON.stringify(agentAction),
    );

    yield { data: { type: 'final', payload: agentAction } };
  }

  async generateWithTools(prompt: string, imageBase64?: string): Promise<AgentAction> {
    this.logger.debug(`Generating with tools for prompt: ${prompt}`);

    await this.vectorStore.addConversation('user', prompt);

    const relevantConversations = await this.vectorStore.findRelevantConversations(prompt);
    const relevantHistoryText = relevantConversations.length > 0
        ? relevantConversations.map(conv => `${conv.role}: ${conv.content}`).join('\n')
        : "No relevant history found.";

    const systemPrompt = this.getSystemPrompt(relevantHistoryText);
    const currentUserParts: Part[] = [{ text: systemPrompt }, { text: `\n\nCURRENT REQUEST: ${prompt}` }];

    if (imageBase64) {
      this.logger.debug('Adding image part to the prompt.');
      currentUserParts.push({ inlineData: { mimeType: 'image/png', data: imageBase64 } });
    }

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const result: GenerateContentResponse = await this.genAI.models.generateContent({
            model: "gemini-1.5-flash-latest",
            contents: [{ role: 'user', parts: currentUserParts }],
            config: this.generationConfig,
        });

        const responseText = result.text;
        this.logger.debug(`LLM Raw Response: ${responseText}`);

        let agentAction: AgentAction;
        try {
          const cleanedJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
          agentAction = JSON.parse(cleanedJson);
        } catch (e) {
          this.logger.warn("LLM response was not valid JSON. Treating as a 'reply' action.", e);
          agentAction = { action: 'reply', parameters: { text: responseText } };
        }

        await this.vectorStore.addConversation('model', JSON.stringify(agentAction));
        return agentAction; // Success, exit the loop and return

      } catch (error) {
        lastError = error;
        // Check for 503 Service Unavailable or similar transient errors
        if (error.status === 'UNAVAILABLE' || (error.message && error.message.includes('overloaded'))) {
          const delay = Math.pow(2, i) * 1000; // Exponential backoff: 1s, 2s, 4s
          this.logger.warn(`Model overloaded (attempt ${i + 1}/${maxRetries}). Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // It's not a retryable error, so rethrow it immediately
          throw error;
        }
      }
    }

    // If all retries have failed
    this.logger.error(`Failed to generate content after ${maxRetries} retries.`);
    throw lastError; // Throw the last captured error
  }
}
