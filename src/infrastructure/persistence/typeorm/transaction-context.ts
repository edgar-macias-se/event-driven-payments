import { AsyncLocalStorage } from 'async_hooks';
import { EntityManager } from 'typeorm';

/**
 * TransactionContext - Almacena el EntityManager de la transacción activa
 *
 * Usa AsyncLocalStorage de Node.js para mantener contexto por request
 * sin contaminar el scope global
 *
 * Similar a ThreadLocal en Java o HttpContext en .NET
 */
class TransactionContext {
  // ════════════════════════════════════════════════════════════════
  // AsyncLocalStorage - API de Node.js para contexto por "flujo async"
  // ════════════════════════════════════════════════════════════════
  private readonly storage = new AsyncLocalStorage<EntityManager>();

  /**
   * run - Ejecuta función con EntityManager en el contexto
   *
   * @param manager - EntityManager de la transacción activa
   * @param fn - Función a ejecutar con este contexto
   * @returns Resultado de fn
   *
   * Durante la ejecución de fn, cualquier llamada a get() retornará
   * este EntityManager
   */
  run<T>(manager: EntityManager, fn: () => Promise<T>): Promise<T> {
    return this.storage.run(manager, fn);
  }

  /**
   * get - Obtiene el EntityManager del contexto actual
   *
   * @returns EntityManager si está dentro de un contexto, undefined si no
   *
   * Los repositorios llaman esto para obtener el manager de la
   * transacción activa sin que se les pase explícitamente
   */
  get(): EntityManager | undefined {
    return this.storage.getStore();
  }

  /**
   * getOrThrow - Obtiene EntityManager o lanza error
   *
   * @returns EntityManager
   * @throws Error si no hay contexto activo
   *
   * Usado por repositorios para fail-fast si se usan fuera de
   * una transacción cuando se requiere una
   */
  getOrThrow(): EntityManager {
    const manager = this.get();

    if (!manager) {
      throw new Error(
        'No transaction context found. ' +
          'Repository methods must be called inside unitOfWork.execute()',
      );
    }

    return manager;
  }
}

// ════════════════════════════════════════════════════════════════
// Singleton - Una sola instancia compartida por toda la aplicación
// ════════════════════════════════════════════════════════════════
// Esto es seguro porque AsyncLocalStorage aísla por request
export const transactionContext = new TransactionContext();
