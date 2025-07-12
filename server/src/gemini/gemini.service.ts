import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  Part,
  ChatSession,
} from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SessionService } from '../session/session.service';
import { ScriptsService } from '../scripts/scripts.service';
import { Response } from 'express';

@Injectable()
export class GeminiService {
  private readonly model: any;
  private readonly logger = new Logger(GeminiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    private readonly scriptsService: ScriptsService,
  ) {
    this.model = new GoogleGenerativeAI(
      process.env.GEMINI_API_KEY,
    ).getGenerativeModel({
      model: 'gemini-1.5-flash-latest',
      generationConfig: { responseMimeType: 'application/json' },
    });
  }

  private getSystemPrompt(platform: string): string {
    return `You are "Deskina," an AI agent in a desktop app on ${platform}. Your goal is to help users by running local commands. You must respond with a single JSON function call. If a command fails, analyze the error and try a different command or ask for clarification. Do not retry the same failed command. Available actions: runCommand(command, args), editFile(filePath, newContent), createScript(name, description, code), listScripts(), runScript(name), reply(content).`;
  }

  private convertBase64ToPart(base64: string, mimeType: string): Part {
    return { inlineData: { data: base64, mimeType } };
  }

  private async streamFinalResult(
    res: Response,
    userId: string,
    sessionId: string,
    action: any,
    usage: any,
  ) {
    if (action.action === 'runCommand' && !action.parameters.args) {
      action.parameters.args = [];
    }
    
    await this.sessionService.addConversation(
      sessionId,
      'model',
      JSON.stringify(action),
    );

    if (usage) {
      await this.prisma.tokenUsage.create({
        data: {
          userId,
          sessionId: sessionId,
          modelName: 'gemini-1.5-flash',
          promptTokens: usage.promptTokenCount,
          completionTokens: usage.candidatesTokenCount || 0,
          totalTokens: usage.totalTokenCount,
        },
      });
    }

    if (action.action === 'reply') {
      const content = action.parameters.content || '';
      for (const char of content) {
        res.write(`data: ${JSON.stringify({ type: 'text_chunk', payload: char })}\n\n`);
        await new Promise((r) => setTimeout(r, 10));
      }
    } else {
      res.write(`data: ${JSON.stringify({ type: 'final', payload: action })}\n\n`);
    }
  }
  
  private async handleServerSideActions(userId: string, action: any) {
    if (action.action === 'createScript') {
      const { name, description, code } = action.parameters;
      await this.scriptsService.create({ userId, name, description, filePath: `scripts/${name}.py`, content: code });
      return { action: 'reply', parameters: { content: `✅ Script "${name}" created.` } };
    }
    if (action.action === 'listScripts') {
      const scripts = await this.scriptsService.findAllForUser(userId);
      const content = scripts.length > 0
        ? `### Available Scripts\n\n${scripts.map(s => `- **${s.name}**`).join('\n')}`
        : "No scripts found.";
      return { action: 'reply', parameters: { content } };
    }
    if (action.action === 'runScript') {
        const script = await this.prisma.script.findUnique({ where: { userId_name: { userId, name: action.parameters.name } } });
        if (script) {
            return { action: 'runScript', parameters: script };
        } else {
            return { action: 'reply', parameters: { content: `❌ Script "${action.parameters.name}" not found.` } };
        }
    }
    return action;
  }

  private async executeChat(
    res: Response,
    userId: string,
    sessionId: string,
    chat: ChatSession,
    parts: Part[],
  ) {
    try {
      const result = await chat.sendMessageStream(parts);
      let rawResponseText = '';
      for await (const chunk of result.stream) {
        rawResponseText += chunk.text();
      }
      
      let finalAction;
      try {
        finalAction = JSON.parse(rawResponseText);
      } catch (e) {
        this.logger.warn('Failed to parse AI response as JSON, treating as text.', rawResponseText);
        finalAction = { action: 'reply', parameters: { content: rawResponseText || 'Received an unusual response from the AI.' } };
      }

      // --- AI 응답 정규화 시작 ---
      
      // 1단계: AI가 액션 계획(배열)을 보냈다면, 첫 번째 액션을 먼저 추출합니다.
      if (Array.isArray(finalAction.actions) && finalAction.actions.length > 0) {
        this.logger.log(`AI proposed a multi-action plan. Executing the first action.`);
        finalAction = finalAction.actions[0];
      }

      // 2단계: 추출된 액션(또는 단일 액션)의 형식을 표준 포맷으로 통일합니다.
      if (finalAction.function && !finalAction.action) {
        // 'function' 키를 'action'으로 변환
        this.logger.log(`Normalizing AI response: 'function' key found.`);
        const { function: functionName, ...parameters } = finalAction;
        finalAction = { action: functionName, parameters: parameters };
      } else if (finalAction.reply && !finalAction.action) {
        // 'reply' 키를 'action: "reply"'로 변환
        this.logger.log(`Normalizing AI response: 'reply' key found.`);
        finalAction = { action: 'reply', parameters: { content: finalAction.reply } };
      }

      // 최종 안전장치: 위 모든 과정을 거쳐도 'action' 키가 없다면, 전체를 텍스트로 간주합니다.
      if (!finalAction.action) {
        this.logger.warn('Could not determine a valid action. Defaulting to text reply.', JSON.stringify(finalAction));
        finalAction = { action: 'reply', parameters: { content: JSON.stringify(finalAction) }};
      }

      // --- AI 응답 정규화 종료 ---

      const clientAction = await this.handleServerSideActions(userId, finalAction);

      const usage = (await result.response)?.usageMetadata;
      await this.streamFinalResult(res, userId, sessionId, clientAction, usage);

    } catch (error) {
        this.logger.error(`Error during AI chat execution for user ${userId} in session ${sessionId}:`, error.stack);
        const userMessage = error.message?.includes('429') 
            ? 'API usage limit exceeded.'
            : 'An error occurred while processing the AI response.';
        const errorAction = { action: 'reply', parameters: { content: userMessage } };
        await this.streamFinalResult(res, userId, sessionId, errorAction, null);
    } finally {
        if (!res.writableEnded) {
            res.end();
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
      const chat = this.model.startChat({
        history: history,
        systemInstruction: { role: 'user', parts: [{ text: this.getSystemPrompt(platform) }] },
      });

      const userParts: Part[] = [{ text: message }];
      if (imageBase64) {
        userParts.push(this.convertBase64ToPart(imageBase64, 'image/png'));
      }
      
      await this.sessionService.addConversation(sessionId, 'user', message, imageBase64);

      await this.executeChat(res, userId, sessionId, chat, userParts);
      
    } catch (error) {
      this.logger.error(`Error in generateResponse for user ${userId}:`, error.stack);
      if (!res.writableEnded) {
        res.status(500).json({ message: "Failed to generate response." });
      }
    }
  }

  async handleToolResult(
    userId: string,
    body: { sessionId: string; command: string; args: any; result: any },
    res: Response,
  ) {
    const { sessionId, command, result } = body;
    const userMessage = `\`${command}\` executed.\n\nResult:\n\`\`\`sh\n${result.stdout || result.stderr || 'No output'}\n\`\`\``;

    try {
        await this.sessionService.addConversation(sessionId, 'user', userMessage);
        
        const history = await this.sessionService.getConversations(sessionId);
        const chat = this.model.startChat({
            history: history,
            systemInstruction: { role: 'user', parts: [{ text: this.getSystemPrompt('win32') }] }, // Platform might need to be stored/retrieved
        });

        await this.executeChat(res, userId, sessionId, chat, [{ text: userMessage }]);
    } catch (error) {
        this.logger.error(`Error handling tool result for user ${userId}:`, error.stack);
        if (!res.writableEnded) {
            res.status(500).json({ message: "Failed to handle tool result." });
        }
    }
  }
}
