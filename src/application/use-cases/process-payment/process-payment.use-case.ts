import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { Payment, PaymentStatus } from '@domain/entities/payment.entity';
import { OutboxEvent } from '@domain/entities/outbox-event.entity';

import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work.interface';

import type { IUnitOfWork } from '../../../domain/ports/unit-of-work.interface';

import { PAYMENT_REPOSITORY } from '../../../domain/ports/payment.repository.interface';

import type { IPaymentRepository } from '../../../domain/ports/payment.repository.interface';

import type { IOutboxRepository } from '../../../domain/ports/outbox.repository.interface';

import { OUTBOX_REPOSITORY } from '../../../domain/ports/outbox.repository.interface';
import { ProcessPaymentDto } from './process-payment.dto';
import { ProcessPaymentResult } from './process-payment.result';

/**
 * ProcessPaymentUseCase - Procesar un pago con Transactional Outbox Pattern
 *
 * Responsabilidades:
 * 1. Validar lógica de negocio (ya validado por DTO, pero puede haber más)
 * 2. Crear entidades de dominio (Payment, OutboxEvent)
 * 3. Persistir atómicamente usando Unit of Work
 * 4. Retornar resultado
 *
 * NO hace:
 * - Publicar a Kafka (eso lo hace el Relay asincrónicamente)
 * - Procesar pagos con proveedor externo (simplificado para demo)
 */
@Injectable()
export class ProcessPaymentUseCase {
  private readonly logger = new Logger(ProcessPaymentUseCase.name);

  constructor(
    // ════════════════════════════════════════════════════════════════
    // Dependency Injection de Ports (interfaces)
    // La implementación (TypeORM) se inyecta en runtime
    // ════════════════════════════════════════════════════════════════
    @Inject(UNIT_OF_WORK)
    private readonly unitOfWork: IUnitOfWork,

    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepository: IPaymentRepository,

    @Inject(OUTBOX_REPOSITORY)
    private readonly outboxRepository: IOutboxRepository,
  ) {}

  /**
   * execute - Punto de entrada del Use Case
   *
   * @param dto - Datos validados del request
   * @returns ProcessPaymentResult con paymentId y status
   */
  async execute(dto: ProcessPaymentDto): Promise<ProcessPaymentResult> {
    this.logger.log(
      `Processing payment for user ${dto!.userId}, amount: ${dto!.amount} ${dto!.currency}`,
    );

    // ════════════════════════════════════════════════════════════════
    // PASO 1: Generar IDs únicos
    // ════════════════════════════════════════════════════════════════
    const paymentId = randomUUID();
    const eventId = randomUUID();

    // ════════════════════════════════════════════════════════════════
    // PASO 2: Ejecutar dentro de Unit of Work (transacción atómica)
    // ════════════════════════════════════════════════════════════════
    const result = await this.unitOfWork.execute(async () => {
      // ──────────────────────────────────────────────────────────────
      // 2.1. Crear Payment entity
      // ──────────────────────────────────────────────────────────────
      const payment = new Payment({
        id: paymentId,
        userId: dto.userId,
        amount: dto.amount,
        currency: dto.currency.toUpperCase(), // Normalizar a mayúsculas
        status: PaymentStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // Constructor de Payment llama validate() internamente
      // Si validación falla, lanza Error y hace ROLLBACK

      // ──────────────────────────────────────────────────────────────
      // 2.2. Guardar Payment en DB
      // ──────────────────────────────────────────────────────────────
      const savedPayment = await this.paymentRepository.save(payment);
      // Usa EntityManager del Unit of Work (transacción activa)

      this.logger.debug(`Payment saved: ${savedPayment.id}`);

      // ──────────────────────────────────────────────────────────────
      // 2.3. Crear OutboxEvent
      // ──────────────────────────────────────────────────────────────
      const eventData = this.serializePaymentEvent(savedPayment);

      const outboxEvent = new OutboxEvent({
        id: eventId,
        name: 'PaymentCreated',
        subject: 'payment.paid', // Topic de Kafka
        data: eventData,
        publishedAt: null, // Pendiente de publicación
        createdAt: new Date(),
      });

      // ──────────────────────────────────────────────────────────────
      // 2.4. Guardar OutboxEvent en DB
      // ──────────────────────────────────────────────────────────────
      await this.outboxRepository.save(outboxEvent);
      // Usa el MISMO EntityManager (misma transacción)

      this.logger.debug(`Outbox event saved: ${outboxEvent.id}`);

      // ──────────────────────────────────────────────────────────────
      // 2.5. Retornar datos para el resultado
      // ──────────────────────────────────────────────────────────────
      return {
        paymentId: savedPayment.id,
        status: savedPayment.status,
      };
    });
    // Si llegó aquí sin errores → COMMIT
    // Si hubo error → ROLLBACK automático

    // ════════════════════════════════════════════════════════════════
    // PASO 3: Log de éxito y retornar resultado
    // ════════════════════════════════════════════════════════════════
    this.logger.log(`Payment processed successfully: ${result.paymentId}`);

    return new ProcessPaymentResult(result.paymentId, result.status);
  }

  /**
   * serializePaymentEvent - Serializar Payment a Buffer
   *
   * En producción, aquí usarías Protobuf:
   * const proto = PaymentProto.encode({ id, userId, amount, ... }).finish();
   * return Buffer.from(proto);
   *
   * Por ahora, usamos JSON como placeholder
   */
  private serializePaymentEvent(payment: Payment): Buffer {
    const eventPayload = {
      id: payment.id,
      userId: payment.userId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      createdAt: payment.createdAt.toISOString(),
    };

    // TODO: Reemplazar con Protobuf en producción
    const jsonString = JSON.stringify(eventPayload);
    return Buffer.from(jsonString, 'utf-8');
  }
}
