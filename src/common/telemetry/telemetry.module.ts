import { Module, Global } from '@nestjs/common';
import { MetricsService } from './metrics.service';

/**
 * TelemetryModule - Módulo global para observability
 *
 * Proporciona MetricsService a toda la aplicación
 */
@Global()
@Module({
  providers: [MetricsService],
  exports: [MetricsService],
})
export class TelemetryModule {}
