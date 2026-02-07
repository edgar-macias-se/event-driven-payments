import { OutboxEvent } from '@domain/entities/outbox-event.entity';

/**
 * IOutboxRepository - Port para gestionar eventos pendientes
 *
 * El Relay usa este repositorio para:
 * 1. Encontrar eventos no publicados
 * 2. Marcarlos como publicados después de enviar a Kafka
 * 3. Obtener métricas (conteo, edad más antigua)
 */
export interface IOutboxRepository {
  /**
   * save - Guardar evento en outbox
   *
   * @param event - Evento a guardar
   * @param transactionManager - REQUERIDO para Transactional Outbox
   * @returns Evento guardado
   *
   * CRÍTICO: Este método SIEMPRE se llama dentro de una transacción
   * junto con PaymentRepository.save()
   */
  save(event: OutboxEvent, transactionManager?: any): Promise<OutboxEvent>;

  /**
   * findUnpublished - Encontrar eventos pendientes de publicación
   *
   * @param limit - Cantidad máxima de eventos a retornar
   * @returns Array de eventos con publishedAt = null, ordenados por createdAt ASC
   *
   * Query SQL equivalente:
   * SELECT * FROM outbox
   * WHERE published_at IS NULL
   * ORDER BY created_at ASC
   * LIMIT ?
   *
   * El índice outbox_unpublished_idx hace esta query muy rápida
   */
  findUnpublished(limit: number): Promise<OutboxEvent[]>;

  /**
   * markAsPublished - Marcar evento como publicado
   *
   * @param eventId - ID del evento
   *
   * Query SQL equivalente:
   * UPDATE outbox
   * SET published_at = NOW()
   * WHERE id = ?
   *
   * El Relay llama esto DESPUÉS de publicar exitosamente a Kafka
   */
  markAsPublished(eventId: string): Promise<void>;

  /**
   * countPending - Contar eventos pendientes (para métrica Gauge)
   *
   * @returns Cantidad de eventos con publishedAt = null
   *
   * Usado por: MetricsService.setOutboxPending()
   */
  countPending(): Promise<number>;

  /**
   * getOldestUnpublishedAge - Obtener edad del evento más antiguo pendiente
   *
   * @returns Edad en segundos, o null si no hay eventos pendientes
   *
   * Query SQL equivalente:
   * SELECT EXTRACT(EPOCH FROM NOW() - MIN(created_at))
   * FROM outbox
   * WHERE published_at IS NULL
   *
   * Usado por: MetricsService.setOutboxOldestAge()
   * Alerta si > 60 segundos (Relay atrasado)
   */
  getOldestUnpublishedAge(): Promise<number | null>;
}

/**
 * OUTBOX_REPOSITORY - Injection token
 */
export const OUTBOX_REPOSITORY = Symbol('OUTBOX_REPOSITORY');
