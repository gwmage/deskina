import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EmbeddingService } from './embedding.service';
import { Conversation } from '@prisma/client';
import cuid = require('cuid');

@Injectable()
export class VectorStoreService {
  private readonly logger = new Logger(VectorStoreService.name);

  constructor(
    private prisma: PrismaService,
    private embeddingService: EmbeddingService,
  ) {}

  async addConversation(
    sessionId: string,
    role: string,
    content: string,
  ): Promise<void> {
    if (!content || typeof content !== 'string') {
      this.logger.warn(`Skipping adding conversation for role ${role} due to empty content.`);
      return;
    }
    
    this.logger.debug(
      `Adding conversation to session ${sessionId}: ${role}`,
    );
    try {
      const embedding = await this.embeddingService.createEmbedding(content);
      const embeddingVector = `[${embedding.join(',')}]`;
      const id = cuid();

      // Use raw query to insert data with a vector type, which Prisma doesn't natively support for insertion yet.
      // Backticks are used to escape the table name `Conversation` which can be a reserved keyword in SQL.
      await this.prisma.$executeRaw`
        INSERT INTO \`Conversation\` (id, sessionId, role, content, embedding, createdAt)
        VALUES (${id}, ${sessionId}, ${role}, ${content}, CAST(${embeddingVector} AS JSON), NOW())
      `;
    } catch (error) {
      this.logger.error(`Failed to add conversation for role ${role}:`, error.stack);
      throw error;
    }
  }

  async findRelevantConversations(
    sessionId: string,
    query: string,
    limit: number = 5,
  ): Promise<Conversation[]> {
    this.logger.debug(
      `Finding relevant conversations in session ${sessionId} for: "${query}"`,
    );
    try {
      const queryEmbedding = await this.embeddingService.createEmbedding(query);
      const queryVector = `[${queryEmbedding.join(',')}]`;

      // Use a raw query with the cosine distance operator (`<=>`) for similarity search.
      // This is a feature of MySQL 8+ with vector support.
      // A smaller distance (closer to 0) means higher similarity.
      const results = await this.prisma.$queryRaw<Conversation[]>`
        SELECT \`id\`, \`role\`, \`content\`, \`createdAt\`
        FROM \`Conversation\`
        WHERE \`sessionId\` = ${sessionId}
        ORDER BY \`embedding\` <=> CAST(${queryVector} AS JSON)
        LIMIT ${limit}
      `;

      this.logger.debug(
        `Found ${results.length} relevant conversations in session ${sessionId}.`,
      );
      // Returns results from most to least relevant.
      return results;
    } catch (error) {
      this.logger.error(`Failed to find relevant conversations for query: "${query}"`, error.stack);
      throw error;
    }
  }
} 