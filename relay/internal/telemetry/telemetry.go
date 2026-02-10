package telemetry

import (
	"context"
	"fmt"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	"go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.27.0"
	"go.uber.org/zap"
)

// Config holds telemetry configuration
type Config struct {
	ServiceName    string
	ServiceVersion string
	Environment    string
	OTLPEndpoint   string
}

// Provider holds OpenTelemetry providers
type Provider struct {
	TracerProvider *trace.TracerProvider
	MeterProvider  *metric.MeterProvider
	logger         *zap.Logger
}

// InitProvider initializes OpenTelemetry providers
func InitProvider(cfg Config, logger *zap.Logger) (*Provider, error) {
	logger.Info("Initializing OpenTelemetry SDK",
		zap.String("service", cfg.ServiceName),
		zap.String("version", cfg.ServiceVersion),
		zap.String("environment", cfg.Environment),
		zap.String("otlp_endpoint", cfg.OTLPEndpoint),
	)

	ctx := context.Background()

	// ════════════════════════════════════════════════════════════════
	// Create Resource (identifies this service)
	// ════════════════════════════════════════════════════════════════
	res := resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceNameKey.String(cfg.ServiceName),
			semconv.ServiceVersionKey.String(cfg.ServiceVersion),
			semconv.ServiceNamespaceKey.String("payments"),
			attribute.String("deployment.environment", cfg.Environment),
			attribute.String("telemetry.sdk.name", "opentelemetry"),
			attribute.String("telemetry.sdk.language", "go"),
			attribute.String("telemetry.sdk.version", "1.40.0"),
	)

	// ════════════════════════════════════════════════════════════════
	// Setup Trace Exporter (OTLP gRPC)
	// ════════════════════════════════════════════════════════════════
	traceExporter, err := otlptracegrpc.New(
		ctx,
		otlptracegrpc.WithEndpoint(cfg.OTLPEndpoint),
		otlptracegrpc.WithInsecure(), // In production, use TLS
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create trace exporter: %w", err)
	}

	// Create TracerProvider
	tracerProvider := trace.NewTracerProvider(
		trace.WithResource(res),
		trace.WithBatcher(traceExporter,
			trace.WithBatchTimeout(5*time.Second),
			trace.WithMaxExportBatchSize(512),
		),
	)

	// Set global tracer provider
	otel.SetTracerProvider(tracerProvider)

	// ════════════════════════════════════════════════════════════════
	// Setup Metric Exporter (OTLP gRPC)
	// ════════════════════════════════════════════════════════════════
	metricExporter, err := otlpmetricgrpc.New(
		ctx,
		otlpmetricgrpc.WithEndpoint(cfg.OTLPEndpoint),
		otlpmetricgrpc.WithInsecure(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create metric exporter: %w", err)
	}

	// Create MeterProvider
	meterProvider := metric.NewMeterProvider(
		metric.WithResource(res),
		metric.WithReader(metric.NewPeriodicReader(
			metricExporter,
			metric.WithInterval(15*time.Second), // Export every 15s
		)),
	)

	// Set global meter provider
	otel.SetMeterProvider(meterProvider)

	// ════════════════════════════════════════════════════════════════
	// Setup Propagators (for distributed tracing)
	// ════════════════════════════════════════════════════════════════
	otel.SetTextMapPropagator(
		propagation.NewCompositeTextMapPropagator(
			propagation.TraceContext{},
			propagation.Baggage{},
		),
	)

	logger.Info("OpenTelemetry SDK initialized successfully")

	return &Provider{
		TracerProvider: tracerProvider,
		MeterProvider:  meterProvider,
		logger:         logger,
	}, nil
}

// Shutdown gracefully shuts down telemetry providers
func (p *Provider) Shutdown(ctx context.Context) error {
	p.logger.Info("Shutting down OpenTelemetry SDK")

	// Shutdown TracerProvider
	if err := p.TracerProvider.Shutdown(ctx); err != nil {
		p.logger.Error("Failed to shutdown TracerProvider", zap.Error(err))
		return err
	}

	// Shutdown MeterProvider
	if err := p.MeterProvider.Shutdown(ctx); err != nil {
		p.logger.Error("Failed to shutdown MeterProvider", zap.Error(err))
		return err
	}

	p.logger.Info("OpenTelemetry SDK shut down successfully")
	return nil
}
