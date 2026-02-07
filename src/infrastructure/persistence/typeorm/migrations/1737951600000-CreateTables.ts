import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CreateTables - Migration inicial
 *
 * Crea:
 * - Schema 'payments'
 * - Tabla 'payments.payments'
 * - Tabla 'payments.outbox' con PARTICIONAMIENTO
 * - Índices para performance
 */
export class CreateTables1737951600000 implements MigrationInterface {
  // ════════════════════════════════════════════════════════════════
  // up() - Ejecutar cambios (crear tablas)
  // ════════════════════════════════════════════════════════════════
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ──────────────────────────────────────────────────────────────
    // 1. Crear schema
    // ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE SCHEMA IF NOT EXISTS payments;
    `);

    // ──────────────────────────────────────────────────────────────
    // 2. Crear tabla payments
    // ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE payments.payments (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL,
        amount INTEGER NOT NULL CHECK (amount > 0),
        currency VARCHAR(3) NOT NULL DEFAULT 'USD',
        status VARCHAR(20) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ──────────────────────────────────────────────────────────────
    // 3. Índices en payments (para queries frecuentes)
    // ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE INDEX payments_user_id_idx 
      ON payments.payments (user_id);
    `);

    await queryRunner.query(`
      CREATE INDEX payments_created_at_idx 
      ON payments.payments (created_at);
    `);

    await queryRunner.query(`
      CREATE INDEX payments_status_idx 
      ON payments.payments (status);
    `);

    // ──────────────────────────────────────────────────────────────
    // 4. Crear tabla outbox con PARTICIONAMIENTO
    // ──────────────────────────────────────────────────────────────
    // NOTA: PARTITION BY RANGE requiere tabla padre sin datos
    await queryRunner.query(`
      CREATE TABLE payments.outbox (
        id UUID NOT NULL,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        data BYTEA NOT NULL,
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id, created_at)
      ) PARTITION BY RANGE (created_at);
    `);

    // ──────────────────────────────────────────────────────────────
    // 5. Índice para el Relay (eventos pendientes)
    // ──────────────────────────────────────────────────────────────
    // Este índice se crea en CADA partición automáticamente
    await queryRunner.query(`
      CREATE INDEX outbox_unpublished_idx 
      ON payments.outbox (created_at)
      WHERE published_at IS NULL;
    `);

    // ──────────────────────────────────────────────────────────────
    // 6. Crear particiones iniciales (7 días)
    // ──────────────────────────────────────────────────────────────
    // Calculamos fechas dinámicamente para que la migration
    // funcione sin importar cuándo se ejecute

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Medianoche de hoy

    for (let i = 0; i < 7; i++) {
      const partitionDate = new Date(today);
      partitionDate.setDate(today.getDate() + i);

      const nextDate = new Date(partitionDate);
      nextDate.setDate(partitionDate.getDate() + 1);

      const partitionName = `outbox_${this.formatDate(partitionDate)}`;
      const fromDate = this.formatDate(partitionDate);
      const toDate = this.formatDate(nextDate);

      await queryRunner.query(`
        CREATE TABLE payments.${partitionName}
        PARTITION OF payments.outbox
        FOR VALUES FROM ('${fromDate}') TO ('${toDate}');
      `);
    }

    // ──────────────────────────────────────────────────────────────
    // 7. Comentarios en tablas (documentación)
    // ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      COMMENT ON TABLE payments.payments IS 
      'Pagos procesados. Contiene estado financiero crítico.';
    `);

    await queryRunner.query(`
      COMMENT ON TABLE payments.outbox IS 
      'Outbox Pattern - Eventos pendientes de publicación a Kafka. 
       Particionado por created_at para limpieza eficiente.';
    `);
  }

  // ════════════════════════════════════════════════════════════════
  // down() - Revertir cambios (rollback)
  // ════════════════════════════════════════════════════════════════
  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar en orden inverso (dependencias primero)

    // 1. Eliminar particiones (opcional, CASCADE las elimina)
    // Las dejamos comentadas porque CASCADE las borra automáticamente

    // 2. Eliminar tabla outbox (incluye particiones por CASCADE)
    await queryRunner.query(`
      DROP TABLE IF EXISTS payments.outbox CASCADE;
    `);

    // 3. Eliminar índices de payments (se eliminan con la tabla)
    // 4. Eliminar tabla payments
    await queryRunner.query(`
      DROP TABLE IF EXISTS payments.payments CASCADE;
    `);

    // 5. Eliminar schema (solo si está vacío)
    await queryRunner.query(`
      DROP SCHEMA IF EXISTS payments CASCADE;
    `);
  }

  // ════════════════════════════════════════════════════════════════
  // Helper: Formatear fecha como YYYY-MM-DD
  // ════════════════════════════════════════════════════════════════
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}_${month}_${day}`;
  }
}
