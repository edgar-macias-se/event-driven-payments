import { Payment } from '@domain/entities/payment.entity';

/**
 * IPaymentRepository - Port (contrato)
 *
 * Define QUÉ operaciones debe soportar un repositorio de pagos
 * NO define CÓMO se implementan (eso es responsabilidad de Infrastructure)
 *
 * Dependency Inversion: Domain define el contrato,
 * Infrastructure lo implementa
 */
export interface IPaymentRepository {
  /**
   * save - Guardar un pago en persistencia
   *
   * @param payment - Entidad de dominio a guardar
   * @param transactionManager - Opcional: para transacciones (TypeORM EntityManager)
   * @returns Payment guardado con campos actualizados (ej: timestamps)
   *
   * NOTA: El parámetro transactionManager es un "leak" de infraestructura,
   * pero es pragmático para el Transactional Outbox Pattern.
   * Alternativa más pura: usar Unit of Work pattern (más complejo).
   */
  save(payment: Payment, transactionManager?: any): Promise<Payment>;

  /**
   * findById - Buscar pago por ID
   *
   * @param id - ID del pago
   * @returns Payment si existe, null si no existe
   */
  findById(id: string): Promise<Payment | null>;

  /**
   * findByUserId - Buscar pagos de un usuario
   *
   * @param userId - ID del usuario
   * @param limit - Opcional: cantidad máxima de resultados
   * @returns Array de pagos (vacío si no hay)
   */
  findByUserId(userId: string, limit?: number): Promise<Payment[]>;

  /**
   * countByStatus - Contar pagos por estado (para métricas)
   *
   * @param status - Estado a contar
   * @returns Cantidad de pagos en ese estado
   */
  countByStatus(status: string): Promise<number>;
}

/**
 * PAYMENT_REPOSITORY - Injection token (Symbol)
 *
 * Se usa en Dependency Injection:
 * - providers: [{ provide: PAYMENT_REPOSITORY, useClass: TypeORMPaymentRepository }]
 * - constructor(@Inject(PAYMENT_REPOSITORY) private repo: IPaymentRepository)
 */
export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');
