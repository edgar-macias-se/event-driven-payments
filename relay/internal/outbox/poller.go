package outbox

import (
	"context"
	"fmt"
	"time"

	"go.uber.org/zap"

	"github.com/edgar-macias-se/event-driven-payments/relay/internal/config"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
	
	"github.com/edgar-macias-se/event-driven-payments/relay/internal/telemetry"
)

// Publisher interface for Kafka (dependency inversion)
type Publisher interface {
	Publish(topic string, key string, data []byte) (int32, int64, error)
}

// Poller continuously polls the outbox and publishes events
type Poller struct {
	repo      *Repository
	publisher Publisher
	config    config.RelayConfig
	logger    *zap.Logger
	metrics 	*telemetry.Metrics 
	tracer 		trace.Tracer
}

// NewPoller creates a new outbox poller
func NewPoller(
	repo *Repository,
	publisher Publisher,
	cfg config.RelayConfig,
	logger *zap.Logger,
	metrics *telemetry.Metrics,
) *Poller {
	return &Poller{
		repo:      repo,
		publisher: publisher,
		config:    cfg,
		logger:    logger,
		metrics: 	 metrics,
		tracer: 	 otel.Tracer("relay-worker"),
	}
}

// Start begins the polling loop
//
// Runs until context is cancelled (graceful shutdown)
func (p *Poller) Start(ctx context.Context) error {
	p.logger.Info("Starting outbox poller",
		zap.Duration("interval", p.config.PollingInterval),
		zap.Int("batchSize", p.config.BatchSize),
	)

	ticker := time.NewTicker(p.config.PollingInterval)
	defer ticker.Stop()

	// Process immediately on start (don't wait for first tick)
	if err := p.processBatch(ctx); err != nil {
		p.logger.Error("Failed to process initial batch", zap.Error(err))
	}

	for {
		select {
		case <-ctx.Done():
			// Graceful shutdown
			p.logger.Info("Poller stopped (context cancelled)")
			return ctx.Err()

		case <-ticker.C:
			// Process batch every interval
			if err := p.processBatch(ctx); err != nil {
				p.logger.Error("Failed to process batch", zap.Error(err))
				// Continue processing (don't crash on error)
			}
		}
	}
}

// processBatch fetches and publishes a batch of events
func (p *Poller) processBatch(ctx context.Context) error {
	
	//crea span for batch processing
	ctx, span := p.tracer.Start(ctx, "Poller.processBatch")
	defer span.End()

	startTime := time.Now()

	// Check if context is already cancelled
	if ctx.Err() != nil {
		return ctx.Err()
	}

	// Fetch unpublished events
	events, err := p.repo.FindUnpublished(p.config.BatchSize)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "Failed to fetch unpublished events")
		return fmt.Errorf("failed to fetch unpublished events: %w", err)
	}

	if len(events) == 0 {
		// No events to process (this is normal)
		return nil
	}

	span.SetAttributes(attribute.Int("batch.size", len(events)))

	p.logger.Info("Processing batch",
		zap.Int("count", len(events)),
	)

	// Process each event
	successCount := 0
	errorCount := 0

	for _, event := range events {
		if err := p.processEvent(ctx, event); err != nil {
			p.logger.Error("Failed to process event",
				zap.String("eventId", event.ID),
				zap.String("eventName", event.Name),
				zap.Error(err),
			)
			errorCount++
			continue // Don't stop batch on single failure
		}
		successCount++
	}

	duration := time.Since(startTime).Seconds()
	p.metrics.RecordBatchDuration(duration, len(events))

	span.SetAttributes(
		attribute.Int("batch.success_count", successCount),
		attribute.Int("batch.error_count", errorCount),
		attribute.Float64("batch.duration_seconds", duration),
	)

	if errorCount > 0 {
		span.SetStatus(codes.Error, fmt.Sprintf("%d events failed", errorCount))
	} else {
		span.SetStatus(codes.Ok, "Batch processed successfully")
	}

	p.logger.Info("Batch processed",
		zap.Int("success", successCount),
		zap.Int("errors", errorCount),
		zap.Float64("duration_seconds", duration),
	)

	return nil
}

// processEvent publishes a single event to Kafka and marks it as published
func (p *Poller) processEvent(ctx context.Context, event Event) error {
	
	// create span for single event process
	ctx, span := p.tracer.Start(ctx, "Poller.processEvent")
	defer span.End()

	span.SetAttributes(
		attribute.String("event.id", event.ID),
		attribute.String("event.name", event.Name),
		attribute.String("event.subject", event.Subject),
	)

	// Check context before processing
	if ctx.Err() != nil {
		return ctx.Err()
	}

	
	startTime := time.Now()
	// Extract userId from event data (for partitioning)
	// TODO: Parse Protobuf to get userId properly
	// For now, use event ID as key (ensures order per event, but not per user)
	key := event.ID

	// Publish to Kafka
	partition, offset, err := p.publisher.Publish(event.Subject, key, event.Data)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "Failed to publish to Kafka")
		
		// Record failed metric
		p.metrics.RecordEventPublished(event.Subject, "failed")

		return fmt.Errorf("failed to publish to Kafka: %w", err)
	}

	// RECORD KAFKA Publish Duration
	publishDuration := time.Since(startTime).Seconds()
	p.metrics.RecordKafkaPublishDuration(publishDuration, event.Subject)

	// Mark as published in DB
	if err := p.repo.MarkAsPublished(event.ID); err != nil {
		p.logger.Warn("Event published to Kafka but failed to mark as published in DB",
			zap.String("eventId", event.ID),
			zap.Int32("partition", partition),
			zap.Int64("offset", offset),
			zap.Error(err),
		)
		// This is not fatal - event was published successfully
		// Manual cleanup may be needed (or idempotency on consumer side)
	}
	
	//Record success metrics
	p.metrics.RecordEventPublished(event.Subject, "success")

	span.SetAttributes(
		attribute.Int("kafka.partition", int(partition)),
		attribute.Int("kafka.offset", int(offset)),
		attribute.Float64("kafka.publish_duration_seconds", publishDuration),
	)
	span.SetStatus(codes.Ok, "Event published successfully")

	p.logger.Info("Event published successfully",
		zap.String("eventId", event.ID),
		zap.String("eventName", event.Name),
		zap.String("topic", event.Subject),
		zap.Int32("partition", partition),
		zap.Int64("offset", offset),
	)

	return nil
}
