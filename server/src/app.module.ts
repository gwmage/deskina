import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GeminiModule } from './gemini/gemini.module';
import { ConfigModule } from '@nestjs/config';
import { SessionModule } from './session/session.module';
import { PrismaModule } from './prisma.module';
import { AuthModule } from './auth/auth.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    GeminiModule,
    SessionModule,
    AuthModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
