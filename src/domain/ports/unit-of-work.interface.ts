/**
 * IUnitOfWork - Port para gestionar transacciones atómicas
 *
 * Abstracción sobre el concepto de "transacción" sin depender de
 * ningún ORM específico (TypeORM, Prisma, etc.)
 *
 * Garantiza:
 * - Todas las operaciones dentro de execute() son atómicas
 * - Si alguna operación falla, TODAS se revierten (ROLLBACK)
 * - Si todas tienen éxito, se confirman (COMMIT)
 */
export interface IUnitOfWork {
  /**
   * execute - Ejecuta operaciones dentro de una transacción
   *
   * @param work - Función async que contiene las operaciones a ejecutar
   * @returns Resultado de la función work
   *
   * @example
   * const result = await unitOfWork.execute(async () => {
   *   await paymentRepo.save(payment);
   *   await outboxRepo.save(event);
   *   return { paymentId: payment.id };
   * });
   *
   * Si cualquier operación lanza error:
   * - ROLLBACK automático
   * - Error se propaga al caller
   *
   * Si todas tienen éxito:
   * - COMMIT automático
   * - Retorna el resultado de work()
   */
  execute<T>(work: () => Promise<T>): Promise<T>;
}

/**
 * UNIT_OF_WORK - Injection token
 *
 * Usado en Dependency Injection:
 * @Inject(UNIT_OF_WORK) private unitOfWork: IUnitOfWork
 */
export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');
