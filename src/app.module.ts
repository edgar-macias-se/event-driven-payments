import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validate } from './common/config/env.validation';
import { typeOrmConfig } from './infrastructure/persistence/typeorm/typeorm.config';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { HttpModule } from './infrastructure/http/http.module';

@Module({
  imports: [
    // ConfigModule
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      envFilePath: '.env',
    }),

    // TypeORM
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: () => typeOrmConfig,
    }),

    // Persistence Module (Repositories + Unit of Work)
    PersistenceModule,

    // Http Module (Controllers)
    HttpModule,
  ],
})
export class AppModule {}
