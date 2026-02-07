import { Injectable, Logger } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { IUnitOfWork } from '@domain/ports/unit-of-work.interface';
import { transactionContext } from './transaction-context';

/**
 * TypeORMUnitOfWork - Implementación de Unit of Work usando TypeORM
 *
 * Responsabilidades:
 * 1. Crear y gestionar QueryRunner (conexión + transacción)
 * 2. Iniciar transacción (BEGIN)
 * 3. Inyectar EntityManager en contexto global (AsyncLocalStorage)
 * 4. Ejecutar operaciones (work function)
 * 5. COMMIT si éxito, ROLLBACK si error
 * 6. Liberar recursos (conexión)
 */
@Injectable()
export class TypeORMUnitOfWork implements IUnitOfWork {
  private readonly logger = new Logger(TypeORMUnitOfWork.name);

  constructor(
    // DataSource = Pool de conexiones a PostgreSQL
    private readonly dataSource: DataSource,
  ) {}

  /**
   * execute - Ejecuta operaciones dentro de una transacción atómica
   */
  async execute<T>(work: () => Promise<T>): Promise<T> {
    // ════════════════════════════════════════════════════════════════
    // PASO 1: Crear QueryRunner (adquiere conexión del pool)
    // ════════════════════════════════════════════════════════════════
    const queryRunner: QueryRunner = this.dataSource.createQueryRunner();

    // Conectar (obtiene conexión física de PostgreSQL)
    await queryRunner.connect();

    // ════════════════════════════════════════════════════════════════
    // PASO 2: Iniciar transacción
    // ════════════════════════════════════════════════════════════════
    // Ejecuta: BEGIN
    await queryRunner.startTransaction();

    this.logger.debug('Transaction started');

    try {
      // ════════════════════════════════════════════════════════════════
      // PASO 3: Ejecutar work() con EntityManager en contexto
      // ════════════════════════════════════════════════════════════════
      // transactionContext.run() guarda queryRunner.manager en
      // AsyncLocalStorage y ejecuta work()
      //
      // Durante work(), cualquier repositorio que llame
      // transactionContext.get() obtendrá este manager
      const result = await transactionContext.run(queryRunner.manager, work);

      // ════════════════════════════════════════════════════════════════
      // PASO 4: COMMIT (si llegó aquí sin errores)
      // ════════════════════════════════════════════════════════════════
      // Ejecuta: COMMIT
      await queryRunner.commitTransaction();

      this.logger.debug('Transaction committed successfully');

      return result;
    } catch (error) {
      // ════════════════════════════════════════════════════════════════
      // PASO 5: ROLLBACK (si hubo error en work())
      // ════════════════════════════════════════════════════════════════
      // Ejecuta: ROLLBACK
      await queryRunner.rollbackTransaction();

      this.logger.error('Transaction rolled back due to error', error);

      // Re-lanzar el error para que el caller lo maneje
      throw error;
    } finally {
      // ════════════════════════════════════════════════════════════════
      // PASO 6: Liberar conexión (siempre se ejecuta)
      // ════════════════════════════════════════════════════════════════
      // Devuelve la conexión al pool para que otros requests la usen
      await queryRunner.release();

      this.logger.debug('Connection released back to pool');
    }
  }
}
