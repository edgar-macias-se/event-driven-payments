import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { IOutboxRepository } from '../../../../domain/ports/outbox.repository.interface';
import { OutboxEvent } from '../../../../domain/entities/outbox-event.entity';
import { OutboxSchema } from '../entities/outbox.schema';
import { transactionContext } from '../transaction-context';

/**
 * TypeORMOutboxRepository - Implementación de IOutboxRepository usando TypeORM
 *
 * Maneja eventos del Transactional Outbox Pattern
 */
@Injectable()
export class TypeORMOutboxRepository implements IOutboxRepository {
  constructor(
    @InjectRepository(OutboxSchema)
    private readonly repository: Repository<OutboxSchema>,
  ) {}

  // ════════════════════════════════════════════════════════════════
  // save() - REQUIERE transacción (siempre se llama con paymentRepo.save())
  // ════════════════════════════════════════════════════════════════
  async save(event: OutboxEvent): Promise<OutboxEvent> {
    // getOrThrow() porque SIEMPRE debe estar en transacción con Payment
    const manager = transactionContext.getOrThrow();

    const schema = OutboxSchema.fromDomain(event);
    const saved = await manager.save(OutboxSchema, schema);

    return OutboxSchema.toDomain(saved);
  }

  // ════════════════════════════════════════════════════════════════
  // findUnpublished() - Usado por el Relay (sin transacción)
  // ════════════════════════════════════════════════════════════════
  async findUnpublished(limit: number): Promise<OutboxEvent[]> {
    // El Relay NO usa transacciones (solo lee y actualiza uno por uno)
    const manager = transactionContext.get();

    let schemas: OutboxSchema[];

    if (manager) {
      // Dentro de transacción (caso raro, pero soportado)
      schemas = await manager
        .createQueryBuilder(OutboxSchema, 'outbox')
        .where('outbox.publishedAt IS NULL')
        .orderBy('outbox.createdAt', 'ASC')
        .limit(limit)
        .getMany();
    } else {
      // Sin transacción (caso normal del Relay)
      schemas = await this.repository
        .createQueryBuilder('outbox')
        .where('outbox.publishedAt IS NULL')
        .orderBy('outbox.createdAt', 'ASC')
        .limit(limit)
        .getMany();
    }

    return schemas.map((schema) => OutboxSchema.toDomain(schema));
  }

  // ════════════════════════════════════════════════════════════════
  // markAsPublished() - Usado por el Relay (sin transacción)
  // ════════════════════════════════════════════════════════════════
  async markAsPublished(eventId: string): Promise<void> {
    const manager = transactionContext.get();

    if (manager) {
      // Dentro de transacción
      await manager.update(
        OutboxSchema,
        { id: eventId },
        { publishedAt: new Date() },
      );
    } else {
      // Sin transacción (caso normal del Relay)
      await this.repository.update(
        { id: eventId },
        { publishedAt: new Date() },
      );
    }
  }

  // ════════════════════════════════════════════════════════════════
  // countPending() - Para métrica Gauge de Prometheus
  // ════════════════════════════════════════════════════════════════
  async countPending(): Promise<number> {
    const manager = transactionContext.get();

    if (manager) {
      return manager.count(OutboxSchema, {
        where: { publishedAt: IsNull() },
      });
    } else {
      return this.repository.count({
        where: { publishedAt: IsNull() },
      });
    }
  }

  // ════════════════════════════════════════════════════════════════
  // getOldestUnpublishedAge() - Para métrica Gauge de Prometheus
  // ════════════════════════════════════════════════════════════════
  async getOldestUnpublishedAge(): Promise<number | null> {
    const manager = transactionContext.get();

    let result: { age: number } | undefined;

    if (manager) {
      // Dentro de transacción
      result = await manager
        .createQueryBuilder(OutboxSchema, 'outbox')
        .select('EXTRACT(EPOCH FROM NOW() - MIN(outbox.createdAt))', 'age')
        .where('outbox.publishedAt IS NULL')
        .getRawOne();
    } else {
      // Sin transacción
      result = await this.repository
        .createQueryBuilder('outbox')
        .select('EXTRACT(EPOCH FROM NOW() - MIN(outbox.createdAt))', 'age')
        .where('outbox.publishedAt IS NULL')
        .getRawOne();
    }

    // Si no hay eventos pendientes, age es NULL
    return result?.age != null ? Math.floor(result.age) : null;
  }
}
