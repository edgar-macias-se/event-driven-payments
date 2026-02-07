import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsString,
  validateSync,
  IsBoolean,
} from 'class-validator';

/**
 *  Enum para NODE_ENV
 *  Solo permite valores especificos
 */
enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
  Staging = 'staging',
}

/**
 * EnvironmentVariables - Schema de validacion
 *
 * Cada variable de entorno debe estar definida aqui con su tipo
 * class-validator valida en startup que todas esten presented y correctas
 */
export class EnvironmentVariables {
  // ==============================
  // Application
  // ==============================
  @IsEnum(Environment)
  NODE_ENV!: Environment;

  @IsNumber()
  PORT!: number;

  @IsString()
  LOG_LEVEL!: string;

  // ==============
  // PostgreSQL
  // ==============
  @IsString()
  DB_HOST!: string;

  @IsNumber()
  DB_PORT!: number;

  @IsString()
  DB_USERNAME!: string;

  @IsString()
  DB_PASSWORD!: string;

  @IsString()
  DB_DATABASE!: string;

  @IsBoolean()
  DB_SYNCHRONIZE!: boolean;

  @IsBoolean()
  DB_LOGGING!: boolean;

  // ===================
  //  Kafka
  // ===================

  @IsString()
  KAFKA_BROKERS!: string;

  @IsString()
  KAFKA_CLIENT_ID!: string;

  @IsString()
  KAFKA_TOPIC_PAYMENT_PAID!: string;

  @IsBoolean()
  KAFKA_SSL_ENABLED!: boolean;

  //════════════════════════════════════════════════════════════════
  // Relay
  // ════════════════════════════════════════════════════════════════
  @IsNumber()
  RELAY_POLLING_INTERVAL_MS!: number;

  @IsNumber()
  RELAY_BATCH_SIZE!: number;

  @IsNumber()
  RELAY_MAX_RETRIES!: number;
}

/**
 * validate - Función que NestJS llama al iniciar
 *
 * Si alguna variable falta o tiene tipo incorrecto, la app NO inicia
 */
export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true, // Convierte strings a números/booleans
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false, // Falla si falta alguna variable
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
