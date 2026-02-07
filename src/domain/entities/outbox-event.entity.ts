/**
 * OutboxEvent Entity - Representa un evento pendiente de publicación
 *
 * Parte del Transactional Outbox Pattern
 * Se guarda en la tabla 'outbox' junto con el payment (misma transacción)
 */
export class OutboxEvent {
  readonly id: string;
  readonly name: string; // Nombre del evento (ej: 'PaymentPaid')
  readonly subject: string; // Topic de Kafka (ej: 'payment.paid')
  readonly data: Buffer; // Evento serializado (Protobuf)
  publishedAt: Date | null; // null = pendiente, Date = publicado
  readonly createdAt: Date;

  constructor(props: OutboxEventProps) {
    this.id = props.id;
    this.name = props.name;
    this.subject = props.subject;
    this.data = props.data;
    this.publishedAt = props.publishedAt;
    this.createdAt = props.createdAt;

    this.validate();
  }

  /**
   * validate - Reglas de negocio
   */
  private validate(): void {
    if (!this.id || this.id.trim().length === 0) {
      throw new Error('Event ID is required');
    }

    if (!this.name || this.name.trim().length === 0) {
      throw new Error('Event name is required');
    }

    if (!this.subject || this.subject.trim().length === 0) {
      throw new Error('Event subject (topic) is required');
    }

    if (!Buffer.isBuffer(this.data)) {
      throw new Error('Event data must be a Buffer');
    }

    if (this.data.length === 0) {
      throw new Error('Event data cannot be empty');
    }
  }

  /**
   * isPublished - Verificar si el evento ya fue publicado
   */
  isPublished(): boolean {
    return this.publishedAt !== null;
  }

  /**
   * markAsPublished - Marcar evento como publicado
   *
   * Solo el Relay puede llamar este método después de publicar a Kafka
   */
  markAsPublished(): void {
    if (this.isPublished()) {
      throw new Error('Event is already published');
    }

    this.publishedAt = new Date();
  }

  /**
   * getAgeInSeconds - Calcular edad del evento
   *
   * Útil para métricas: "¿Cuánto tiempo lleva este evento sin publicarse?"
   */
  getAgeInSeconds(): number {
    const now = Date.now();
    const created = this.createdAt.getTime();
    return Math.floor((now - created) / 1000);
  }

  /**
   * isPending - Verificar si el evento está pendiente de publicación
   */
  isPending(): boolean {
    return !this.isPublished();
  }
}

/**
 * OutboxEventProps - Interface para constructor
 */
export interface OutboxEventProps {
  id: string;
  name: string;
  subject: string;
  data: Buffer;
  publishedAt: Date | null;
  createdAt: Date;
}
