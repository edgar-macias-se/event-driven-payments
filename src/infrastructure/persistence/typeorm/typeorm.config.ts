import { DataSource, DataSourceOptions } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';

// ════════════════════════════════════════════════════════════════
// Cargar .env manualmente para migrations CLI
// ════════════════════════════════════════════════════════════════
// TypeORM CLI no tiene acceso a NestJS ConfigService,
// por eso cargamos .env directamente
config();

// ════════════════════════════════════════════════════════════════
// ConfigService para usar en runtime (NestJS)
// ════════════════════════════════════════════════════════════════
const configService = new ConfigService();

// ════════════════════════════════════════════════════════════════
// TypeORM DataSource Options
// ════════════════════════════════════════════════════════════════
export const typeOrmConfig: DataSourceOptions = {
  type: 'postgres',

  // Conexión
  host: configService.get<string>('DB_HOST') || 'localhost',
  port: configService.get<number>('DB_PORT') || 5432,
  username: configService.get<string>('DB_USERNAME') || 'payments_user',
  password: configService.get<string>('DB_PASSWORD') || 'payments_pass',
  database: configService.get<string>('DB_DATABASE') || 'payments_db',

  // Schemas (entidades con decoradores @Entity)
  entities: [__dirname + '/entities/*.schema.{ts,js}'],

  // Migrations (scripts SQL para crear/modificar tablas)
  migrations: [__dirname + '/migrations/*.{ts,js}'],

  // ════════════════════════════════════════════════════════════════
  // CRÍTICO: synchronize SIEMPRE debe ser false en producción
  // ════════════════════════════════════════════════════════════════
  // synchronize: true → TypeORM auto-genera DDL (DROP/CREATE tables)
  // Esto es PELIGROSO en producción (puede borrar datos)
  //
  // En su lugar, usamos migrations controladas
  synchronize: configService.get<boolean>('DB_SYNCHRONIZE') || false,

  // Logging (útil en desarrollo para ver queries)
  logging: configService.get<boolean>('DB_LOGGING') || false,

  // ════════════════════════════════════════════════════════════════
  // Pool de conexiones
  // ════════════════════════════════════════════════════════════════
  // max: Máximo de conexiones simultáneas
  // En producción con alto tráfico, ajustar según carga
  extra: {
    max: 20, // Máximo 20 conexiones
    min: 5, // Mínimo 5 conexiones activas
  },
};

// ════════════════════════════════════════════════════════════════
// DataSource para TypeORM CLI (migrations)
// ════════════════════════════════════════════════════════════════
// Este export lo usa el comando: pnpm run typeorm migration:run
export default new DataSource(typeOrmConfig);
