import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application/aplication.module';
import { PaymentController } from './controllers/payment.controller';

/**
 * HttpModule - Agrupa todos los Controllers
 *
 * Importa ApplicationModule para acceder a Use Cases
 */
@Module({
  imports: [
    // ════════════════════════════════════════════════════════════════
    // ApplicationModule provee Use Cases
    // ════════════════════════════════════════════════════════════════
    ApplicationModule,
  ],
  controllers: [
    // ════════════════════════════════════════════════════════════════
    // Registrar Controllers HTTP
    // ════════════════════════════════════════════════════════════════
    PaymentController,
  ],
})
export class HttpModule {}
