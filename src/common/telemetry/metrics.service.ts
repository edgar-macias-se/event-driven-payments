import { Injectable, Logger } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';

/**
 * MetricsService - Servicio para métricas custom de negocio
 *
 * Proporciona métricas específicas del Payment Service:
 * - Contador de pagos procesados
 * - Gauge de pagos por status
 * - Histograma de duración de transacciones
 */
@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly meter = metrics.getMeter('payment-api-metrics');

  // ════════════════════════════════════════════════════════════════
  // COUNTER: Total de pagos procesados
  // ════════════════════════════════════════════════════════════════
  private readonly paymentsProcessedCounter = this.meter.createCounter(
    'payments_processed_total',
    {
      description: 'Total number of payments processed',
      unit: '1', // Unitless (count)
    },
  );

  // ════════════════════════════════════════════════════════════════
  // HISTOGRAM: Duración de transacciones de pago
  // ════════════════════════════════════════════════════════════════
  private readonly paymentDurationHistogram = this.meter.createHistogram(
    'payment_transaction_duration_seconds',
    {
      description: 'Duration of payment transactions in seconds',
      unit: 's', // Seconds
    },
  );

  // ════════════════════════════════════════════════════════════════
  // COUNTER: Total de eventos de outbox creados
  // ════════════════════════════════════════════════════════════════
  private readonly outboxEventsCreatedCounter = this.meter.createCounter(
    'outbox_events_created_total',
    {
      description: 'Total number of outbox events created',
      unit: '1',
    },
  );

  constructor() {
    this.logger.log('MetricsService initialized');
  }

  /**
   * recordPaymentProcessed - Incrementa contador de pagos procesados
   *
   * @param status - Estado del pago (success, failed)
   * @param currency - Moneda del pago (USD, EUR, etc.)
   */
  recordPaymentProcessed(status: 'success' | 'failed', currency: string): void {
    this.paymentsProcessedCounter.add(1, {
      status,
      currency,
    });

    this.logger.debug(
      `Payment processed metric recorded: status=${status}, currency=${currency}`,
    );
  }

  /**
   * recordPaymentDuration - Registra duración de transacción de pago
   *
   * @param durationMs - Duración en milisegundos
   * @param status - Estado del pago
   */
  recordPaymentDuration(durationMs: number, status: string): void {
    const durationSeconds = durationMs / 1000;

    this.paymentDurationHistogram.record(durationSeconds, {
      status,
    });

    this.logger.debug(
      `Payment duration metric recorded: ${durationSeconds}s, status=${status}`,
    );
  }

  /**
   * recordOutboxEventCreated - Incrementa contador de eventos de outbox
   *
   * @param eventName - Nombre del evento (PaymentCreated, etc.)
   */
  recordOutboxEventCreated(eventName: string): void {
    this.outboxEventsCreatedCounter.add(1, {
      event_name: eventName,
    });

    this.logger.debug(`Outbox event created metric recorded: ${eventName}`);
  }
}
