import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  Payment,
  PaymentStatus,
} from '../../../../domain/entities/payment.entity';

/**
 * PaymentSchema - TypeORM Entity (Schema con decoradores)
 *
 * Mapea la tabla 'payments.payments' en PostgreSQL
 * Contiene SOLO decoradores de TypeORM, sin lógica de negocio
 */
@Entity('payments', { schema: 'payments' })
export class PaymentSchema {
  // ════════════════════════════════════════════════════════════════
  // Columnas de la tabla
  // ════════════════════════════════════════════════════════════════

  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Column('integer')
  amount!: number;

  @Column('varchar', { length: 3, default: 'USD' })
  currency!: string;

  @Column('varchar', { length: 20 })
  status!: PaymentStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  // ════════════════════════════════════════════════════════════════
  // Mapper: Domain Entity → TypeORM Schema
  // ════════════════════════════════════════════════════════════════
  /**
   * fromDomain - Convierte Payment (domain) a PaymentSchema (TypeORM)
   *
   * Usado antes de guardar en DB:
   * const schema = PaymentSchema.fromDomain(payment);
   * await manager.save(schema);
   */
  static fromDomain(entity: Payment): PaymentSchema {
    const schema = new PaymentSchema();
    schema.id = entity.id;
    schema.userId = entity.userId;
    schema.amount = entity.amount;
    schema.currency = entity.currency;
    schema.status = entity.status;
    schema.createdAt = entity.createdAt;
    schema.updatedAt = entity.updatedAt;
    return schema;
  }

  // ════════════════════════════════════════════════════════════════
  // Mapper: TypeORM Schema → Domain Entity
  // ════════════════════════════════════════════════════════════════
  /**
   * toDomain - Convierte PaymentSchema (TypeORM) a Payment (domain)
   *
   * Usado después de leer de DB:
   * const schema = await manager.findOne(PaymentSchema, { where: { id } });
   * const payment = PaymentSchema.toDomain(schema);
   */
  static toDomain(schema: PaymentSchema): Payment {
    return new Payment({
      id: schema.id,
      userId: schema.userId,
      amount: schema.amount,
      currency: schema.currency,
      status: schema.status,
      createdAt: schema.createdAt,
      updatedAt: schema.updatedAt,
    });
  }
}
