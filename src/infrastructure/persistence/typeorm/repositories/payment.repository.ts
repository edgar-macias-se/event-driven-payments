import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IPaymentRepository } from '../../../../domain/ports/payment.repository.interface';
import {
  Payment,
  PaymentStatus,
} from '../../../../domain/entities/payment.entity';
import { PaymentSchema } from '../entities/payment.schema';
import { transactionContext } from '../transaction-context';

/**
 * TypeORMPaymentRepository - Implementación de IPaymentRepository usando TypeORM
 *
 * Soporta DOS modos:
 * 1. Con transacción (dentro de unitOfWork.execute())
 * 2. Sin transacción (queries de lectura independientes)
 */
@Injectable()
export class TypeORMPaymentRepository implements IPaymentRepository {
  constructor(
    @InjectRepository(PaymentSchema)
    private readonly repository: Repository<PaymentSchema>,
  ) {}

  // ════════════════════════════════════════════════════════════════
  // save() - REQUIERE transacción (para Transactional Outbox)
  // ════════════════════════════════════════════════════════════════
  async save(payment: Payment): Promise<Payment> {
    // getOrThrow() porque save() DEBE estar dentro de una transacción
    // (siempre se llama junto con outboxRepo.save())
    const manager = transactionContext.getOrThrow();

    const schema = PaymentSchema.fromDomain(payment);
    const saved = await manager.save(PaymentSchema, schema);

    return PaymentSchema.toDomain(saved);
  }

  // ════════════════════════════════════════════════════════════════
  // findById() - Funciona con o sin transacción
  // ════════════════════════════════════════════════════════════════
  async findById(id: string): Promise<Payment | null> {
    // get() sin throw - permite funcionar fuera de transacción
    const manager = transactionContext.get();

    let schema: PaymentSchema | null;

    if (manager) {
      // Modo 1: Dentro de transacción - usar ese manager
      schema = await manager.findOne(PaymentSchema, { where: { id } });
    } else {
      // Modo 2: Sin transacción - usar repository default
      schema = await this.repository.findOne({ where: { id } });
    }

    return schema ? PaymentSchema.toDomain(schema) : null;
  }

  // ════════════════════════════════════════════════════════════════
  // findByUserId() - Funciona con o sin transacción
  // ════════════════════════════════════════════════════════════════
  async findByUserId(userId: string, limit?: number): Promise<Payment[]> {
    const manager = transactionContext.get();

    let schemas: PaymentSchema[];

    if (manager) {
      // Dentro de transacción
      const queryBuilder = manager
        .createQueryBuilder(PaymentSchema, 'payment')
        .where('payment.userId = :userId', { userId })
        .orderBy('payment.createdAt', 'DESC');

      if (limit) {
        queryBuilder.limit(limit);
      }

      schemas = await queryBuilder.getMany();
    } else {
      // Sin transacción
      const queryBuilder = this.repository
        .createQueryBuilder('payment')
        .where('payment.userId = :userId', { userId })
        .orderBy('payment.createdAt', 'DESC');

      if (limit) {
        queryBuilder.limit(limit);
      }

      schemas = await queryBuilder.getMany();
    }

    return schemas.map((schema) => PaymentSchema.toDomain(schema));
  }

  // ════════════════════════════════════════════════════════════════
  // countByStatus() - Para métricas de Prometheus
  // ════════════════════════════════════════════════════════════════
  async countByStatus(status: PaymentStatus): Promise<number> {
    const manager = transactionContext.get();

    if (manager) {
      return manager.count(PaymentSchema, { where: { status } });
    } else {
      return this.repository.count({ where: { status } });
    }
  }
}
