import { Entity, Column, Index } from 'typeorm';
import { OutboxEvent } from '../../../../domain/entities/outbox-event.entity';

/**
 * OutboxSchema - TypeORM Entity para tabla outbox
 *
 * NOTA: Esta tabla usa PARTICIONAMIENTO por created_at
 * El particionamiento y PRIMARY KEY se crean en la migration
 * NO usamos @PrimaryColumn porque debe ser compuesto (id, created_at)
 */
@Entity('outbox', { schema: 'payments' })
@Index('outbox_unpublished_idx', ['createdAt'], {
  where: 'published_at IS NULL',
})
export class OutboxSchema {
  // ════════════════════════════════════════════════════════════════
  // Composite Primary Key: (id, created_at)
  // Definido en migration, no con decoradores
  // ════════════════════════════════════════════════════════════════
  @Column('uuid', { primary: true })
  id!: string;

  @Column('text')
  name!: string;

  @Column('text')
  subject!: string;

  @Column('bytea')
  data!: Buffer;

  @Column('timestamptz', { name: 'published_at', nullable: true })
  publishedAt!: Date | null;

  @Column('timestamptz', {
    name: 'created_at',
    primary: true,
    default: () => 'NOW()',
  })
  createdAt!: Date;

  static fromDomain(entity: OutboxEvent): OutboxSchema {
    const schema = new OutboxSchema();
    schema.id = entity.id;
    schema.name = entity.name;
    schema.subject = entity.subject;
    schema.data = entity.data;
    schema.publishedAt = entity.publishedAt;
    schema.createdAt = entity.createdAt;
    return schema;
  }

  static toDomain(schema: OutboxSchema): OutboxEvent {
    return new OutboxEvent({
      id: schema.id,
      name: schema.name,
      subject: schema.subject,
      data: schema.data,
      publishedAt: schema.publishedAt,
      createdAt: schema.createdAt,
    });
  }
}
