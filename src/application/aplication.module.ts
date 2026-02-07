import { Module } from '@nestjs/common';
import { PersistenceModule } from '../infrastructure/persistence/persistence.module';
import { ProcessPaymentUseCase } from './use-cases/process-payment/process-payment.use-case';

/**
 * ApplicationModule - Registra Use Cases
 *
 * Importa PersistenceModule para acceder a:
 * - UNIT_OF_WORK
 * - PAYMENT_REPOSITORY
 * - OUTBOX_REPOSITORY
 *
 * Exporta Use Cases para que Controllers los inyecten
 */
@Module({
  imports: [
    // ════════════════════════════════════════════════════════════════
    // PersistenceModule provee los repositorios
    // ════════════════════════════════════════════════════════════════
    PersistenceModule,
  ],
  providers: [
    // ════════════════════════════════════════════════════════════════
    // Registrar Use Cases
    // ════════════════════════════════════════════════════════════════
    ProcessPaymentUseCase,
  ],
  exports: [
    // ════════════════════════════════════════════════════════════════
    // Exportar para que Controllers puedan inyectar
    // ════════════════════════════════════════════════════════════════
    ProcessPaymentUseCase,
  ],
})
export class ApplicationModule {}
