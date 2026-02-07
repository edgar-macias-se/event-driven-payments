/**
 * Barrel export - Simplifica imports
 *
 * En lugar de:
 * import { ProcessPaymentDto } from './process-payment.dto';
 * import { ProcessPaymentResult } from './process-payment.result';
 * import { ProcessPaymentUseCase } from './process-payment.use-case';
 *
 * Podemos hacer:
 * import { ProcessPaymentDto, ProcessPaymentResult, ProcessPaymentUseCase } from './process-payment';
 */
export { ProcessPaymentDto } from './process-payment.dto';
export { ProcessPaymentResult } from './process-payment.result';
export { ProcessPaymentUseCase } from './process-payment.use-case';
