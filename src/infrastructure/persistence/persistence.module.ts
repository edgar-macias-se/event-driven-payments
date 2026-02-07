import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Schemas
import { PaymentSchema } from './typeorm/entities/payment.schema';
import { OutboxSchema } from './typeorm/entities/outbox.schema';

// Repositories
import { TypeORMPaymentRepository } from './typeorm/repositories/payment.repository';
import { TypeORMOutboxRepository } from './typeorm/repositories/outbox.repository';

// Unit of Work
import { TypeORMUnitOfWork } from './typeorm/unit-of-work';

// Tokens de Domain
import { PAYMENT_REPOSITORY } from '../../domain/ports/payment.repository.interface';
import { OUTBOX_REPOSITORY } from '../../domain/ports/outbox.repository.interface';
import { UNIT_OF_WORK } from '../../domain/ports/unit-of-work.interface';

/**
 * PersistenceModule - Configura toda la capa de persistencia
 *
 * Registra:
 * - TypeORM entities (schemas)
 * - Implementaciones de repositorios
 * - Unit of Work
 *
 * Exports:
 * - Tokens de Domain (para que Application Layer los use)
 */
@Module({
  imports: [
    // ════════════════════════════════════════════════════════════════
    // Registrar schemas con TypeORM
    // ════════════════════════════════════════════════════════════════
    TypeOrmModule.forFeature([PaymentSchema, OutboxSchema]),
  ],
  providers: [
    // ════════════════════════════════════════════════════════════════
    // Unit of Work
    // ════════════════════════════════════════════════════════════════
    {
      provide: UNIT_OF_WORK,
      useClass: TypeORMUnitOfWork,
    },

    // ════════════════════════════════════════════════════════════════
    // Payment Repository
    // ════════════════════════════════════════════════════════════════
    {
      provide: PAYMENT_REPOSITORY,
      useClass: TypeORMPaymentRepository,
    },

    // ════════════════════════════════════════════════════════════════
    // Outbox Repository
    // ════════════════════════════════════════════════════════════════
    {
      provide: OUTBOX_REPOSITORY,
      useClass: TypeORMOutboxRepository,
    },
  ],
  exports: [
    // ════════════════════════════════════════════════════════════════
    // Exportar tokens para que otros módulos puedan inyectarlos
    // ════════════════════════════════════════════════════════════════
    UNIT_OF_WORK,
    PAYMENT_REPOSITORY,
    OUTBOX_REPOSITORY,
  ],
})
export class PersistenceModule {}
