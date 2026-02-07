/**
 * ProcessPaymentResult - Output del Use Case
 *
 * Retorna información mínima necesaria para el caller (Controller)
 */
export class ProcessPaymentResult {
  /**
   * paymentId - ID del pago creado
   *
   * El caller puede usarlo para:
   * - Mostrar confirmación al usuario
   * - Redirigir a /payments/{paymentId}
   * - Tracking en logs
   */
  readonly paymentId: string;

  /**
   * status - Estado actual del pago
   *
   * Típicamente será 'PENDING' después de procesar
   * (el pago puede cambiar a PAID/FAILED asincrónicamente)
   */
  readonly status: string;

  constructor(paymentId: string, status: string) {
    this.paymentId = paymentId;
    this.status = status;
  }
}
