/**
 * IEventPublisher - Port para publicar eventos a un message broker
 *
 * Abstracción sobre Kafka (o cualquier otro broker: RabbitMQ, NATS, etc.)
 * El dominio NO sabe que existe Kafka, solo sabe que puede "publicar eventos"
 */
export interface IEventPublisher {
  /**
   * publish - Publicar evento a un topic
   *
   * @param topic - Topic/canal destino (ej: 'payment.paid')
   * @param data - Datos serializados (Buffer con Protobuf)
   * @param key - Opcional: Key para particionamiento (ej: userId)
   *
   * Kafka usa 'key' para decidir a qué partición enviar:
   * - Mismo key → Misma partición → Orden garantizado
   * - Sin key → Round-robin entre particiones
   *
   * Para pagos, key = userId garantiza que eventos del mismo usuario
   * se procesan en orden
   */
  publish(topic: string, data: Buffer, key?: string): Promise<void>;

  /**
   * connect - Establecer conexión con el broker
   *
   * Se llama al iniciar el servicio (onModuleInit en NestJS)
   */
  connect(): Promise<void>;

  /**
   * disconnect - Cerrar conexión con el broker
   *
   * Se llama al apagar el servicio (onModuleDestroy en NestJS)
   * Asegura que todos los mensajes pendientes se envíen antes de cerrar
   */
  disconnect(): Promise<void>;
}

/**
 * EVENT_PUBLISHER - Injection token
 */
export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
