import {
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ProcessPaymentDto,
  ProcessPaymentResult,
  ProcessPaymentUseCase,
} from '../../../application/use-cases/process-payment';

/**
 * PaymentController - HTTP REST API para pagos
 *
 * Endpoints:
 * - POST /payments - Crear un pago
 */
@Controller('payments')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    // ════════════════════════════════════════════════════════════════
    // Inyectar Use Case (Application Layer)
    // ════════════════════════════════════════════════════════════════
    private readonly processPaymentUseCase: ProcessPaymentUseCase,
  ) {}

  /**
   * create - Procesar un pago
   *
   * POST /payments
   * Body: { userId, amount, currency }
   *
   * @param dto - DTO validado por ValidationPipe
   * @returns ProcessPaymentResult
   *
   * HTTP Status Codes:
   * - 201: Pago creado exitosamente
   * - 400: Validación falló (ValidationPipe)
   * - 500: Error interno (transacción falló)
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: ProcessPaymentDto): Promise<ProcessPaymentResult> {
    this.logger.log(
      `Received payment request: userId=${dto.userId}, amount=${dto.amount}`,
    );

    try {
      // ════════════════════════════════════════════════════════════════
      // Delegar lógica de negocio al Use Case
      // ════════════════════════════════════════════════════════════════
      const result = await this.processPaymentUseCase.execute(dto);

      this.logger.log(`Payment created successfully: ${result.paymentId}`);

      return result;
    } catch (error) {
      // ════════════════════════════════════════════════════════════════
      // Log del error y re-lanzar
      // ════════════════════════════════════════════════════════════════
      this.logger.error(
        `Failed to process payment: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error,
      );

      // NestJS convierte errores en HTTP 500 automáticamente
      throw error;
    }
  }
}
