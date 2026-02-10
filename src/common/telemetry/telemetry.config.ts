import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { Logger } from '@nestjs/common';

/**
 * TelemetryConfig - Configuración centralizada de OpenTelemetry
 *
 * Inicializa el SDK de OpenTelemetry con:
 * - Auto-instrumentación (HTTP, DB, etc.)
 * - Exporters (OTLP gRPC)
 * - Resource attributes (service name, version, etc.)
 */
export class TelemetryConfig {
  private static sdk: NodeSDK;
  private static readonly logger = new Logger('TelemetryConfig');

  /**
   * initialize - Configura e inicia OpenTelemetry SDK
   *
   * IMPORTANTE: Debe llamarse ANTES de importar cualquier otro módulo
   * (para que auto-instrumentation funcione correctamente)
   */
  static initialize(): void {
    this.logger.log('Initializing OpenTelemetry SDK...');

    // ════════════════════════════════════════════════════════════════
    // Configurar Resource (identifica este servicio)
    // ════════════════════════════════════════════════════════════════
    const resource = resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: 'payment-api',
      [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
      [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'payments',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
        process.env.NODE_ENV || 'development',
    });

    // ════════════════════════════════════════════════════════════════
    // Configurar Trace Exporter (envía traces al Collector)
    // ════════════════════════════════════════════════════════════════
    const traceExporter = new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'grpc://localhost:4317',
    });

    // ════════════════════════════════════════════════════════════════
    // Configurar Metric Exporter (envía métricas al Collector)
    // ════════════════════════════════════════════════════════════════
    const metricExporter = new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'grpc://localhost:4317',
    });

    const metricReader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 15000, // Exportar cada 15 segundos
    });

    // ════════════════════════════════════════════════════════════════
    // Configurar Auto-Instrumentations
    // ════════════════════════════════════════════════════════════════
    // Esto instrumenta automáticamente:
    // - HTTP requests (NestJS, Express)
    // - Database queries (TypeORM, PostgreSQL)
    // - DNS lookups
    // - File system operations
    // - Y 50+ librerías más
    const instrumentations = getNodeAutoInstrumentations({
      // Configuración específica para HTTP
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (request) => {
          const ignorePatterns = ['/health', '/metrics'];

          const isIgnored = ignorePatterns.some((pattern) =>
            request.url?.includes(pattern),
          );

          return isIgnored;
        }, // No trazar health checks
      },
      // Configuración específica para PostgreSQL
      '@opentelemetry/instrumentation-pg': {
        enhancedDatabaseReporting: true, // Incluir SQL queries en spans
      },
    });

    // ════════════════════════════════════════════════════════════════
    // Crear NodeSDK (configura todo el stack de OTel)
    // ════════════════════════════════════════════════════════════════
    this.sdk = new NodeSDK({
      resource,
      traceExporter,
      metricReader,
      instrumentations,
    });

    // ════════════════════════════════════════════════════════════════
    // Iniciar SDK
    // ════════════════════════════════════════════════════════════════
    this.sdk.start();

    this.logger.log('OpenTelemetry SDK initialized successfully');
    this.logger.log(
      `Service: ${resource.attributes[SemanticResourceAttributes.SERVICE_NAME]}`,
    );
    this.logger.log(
      `Version: ${resource.attributes[SemanticResourceAttributes.SERVICE_VERSION]}`,
    );
    this.logger.log(
      `Environment: ${resource.attributes[SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]}`,
    );
    this.logger.log(
      `Exporter: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'grpc://localhost:4317'}`,
    );

    // ════════════════════════════════════════════════════════════════
    // Graceful shutdown (cuando app se cierra)
    // ════════════════════════════════════════════════════════════════
    process.on('SIGTERM', async () => {
      this.logger.log('Shutting down OpenTelemetry SDK...');
      try {
        await this.sdk.shutdown();
        this.logger.log('OpenTelemetry SDK shut down successfully');
      } catch (error) {
        this.logger.error('Error shutting down OpenTelemetry SDK', error);
      }
    });
  }

  /**
   * shutdown - Apaga el SDK manualmente (usado en tests)
   */
  static async shutdown(): Promise<void> {
    if (this.sdk) {
      await this.sdk.shutdown();
    }
  }
}
