import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private genAI: GoogleGenAI;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    this.genAI = new GoogleGenAI({apiKey});
  }

  async createEmbedding(text: string): Promise<number[]> {
    if (!text || typeof text !== 'string') {
        this.logger.warn(`Invalid input for embedding: ${text}. Returning empty array.`);
        return [];
    }

    try {
      // The `contents` parameter expects an array of Content objects.
      const result = await this.genAI.models.embedContent({
        model: "text-embedding-004",
        contents: [{ parts: [{ text }] }],
      });
      
      // The `embeddings` property is an array, we take the first one.
      if (!result.embeddings || result.embeddings.length === 0 || !result.embeddings[0].values) {
        this.logger.error('API response did not contain a valid embedding.');
        throw new Error('Failed to create embedding: No embeddings returned.');
      }

      return result.embeddings[0].values;
    } catch (error) {
      this.logger.error(`Failed to create embedding for text: "${text}"`, error.stack);
      throw error;
    }
  }
} 