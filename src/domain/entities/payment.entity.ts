/**
 * Payment Entity - Representa un pago procesado
 *
 * Esta es la entidad de DOMINIO pura (sin decoradores de TypeORM)
 * Contiene solo lógica de negocio
 */
export class Payment {
  readonly id: string;
  readonly userId: string;
  readonly amount: number; // En centavos (100 = $1.00)
  readonly currency: string; // ISO 4217 (USD, EUR, MXN)
  status: PaymentStatus; // Mutable (transiciones de estado)
  readonly createdAt: Date;
  updatedAt: Date;

  constructor(props: PaymentProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.amount = props.amount;
    this.currency = props.currency;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;

    // Validar inmediatamente después de asignar
    this.validate();
  }

  /**
   * validate - Reglas de negocio del dominio
   *
   * Si alguna regla falla, lanza Error (fail-fast)
   */
  private validate(): void {
    if (!this.id || this.id.trim().length === 0) {
      throw new Error('Payment ID is required');
    }

    if (!this.userId || this.userId.trim().length === 0) {
      throw new Error('User ID is required');
    }

    if (typeof this.amount !== 'number' || this.amount <= 0) {
      throw new Error('Amount must be a positive number');
    }

    if (!this.currency || this.currency.length !== 3) {
      throw new Error('Currency must be a valid ISO 4217 code (3 characters)');
    }

    // Validar que currency esté en mayúsculas
    if (this.currency !== this.currency.toUpperCase()) {
      throw new Error('Currency must be uppercase (e.g., USD, EUR, MXN)');
    }

    if (!Object.values(PaymentStatus).includes(this.status)) {
      throw new Error(`Invalid payment status: ${this.status}`);
    }
  }

  /**
   * markAsPaid - Transición de estado (comportamiento de dominio)
   *
   * Encapsula la lógica de negocio: solo se puede marcar como PAID
   * si está en estado PENDING
   */
  markAsPaid(): void {
    if (this.status === PaymentStatus.PAID) {
      throw new Error('Payment is already paid');
    }

    if (this.status === PaymentStatus.FAILED) {
      throw new Error('Cannot mark failed payment as paid');
    }

    this.status = PaymentStatus.PAID;
    this.updatedAt = new Date();
  }

  /**
   * markAsFailed - Transición de estado a FAILED
   */
  markAsFailed(reason?: string): void {
    if (this.status === PaymentStatus.PAID) {
      throw new Error(`Cannot mark paid payment as failed ${reason || ''}`);
    }

    this.status = PaymentStatus.FAILED;
    this.updatedAt = new Date();
  }

  /**
   * isPaid - Query method (no modifica estado)
   */
  isPaid(): boolean {
    return this.status === PaymentStatus.PAID;
  }
}

/**
 * PaymentStatus - Enum para estados válidos
 */
export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
}

/**
 * PaymentProps - Interface para constructor
 *
 * Usamos interface en lugar de Partial<Payment> para control explícito
 */
export interface PaymentProps {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
}
