package telemetry

import (
	"context"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	"go.uber.org/zap"
)

// Metrics holds custom business metrics for Relay service
type Metrics struct {
	meter                     metric.Meter
	logger                    *zap.Logger
	eventsPublishedCounter    metric.Int64Counter
	batchDurationHistogram    metric.Float64Histogram
	kafkaPublishHistogram     metric.Float64Histogram
	pendingEventsGauge        metric.Int64ObservableGauge
	oldestEventAgeGauge       metric.Int64ObservableGauge
	pendingEventsCallback     func() int64
	oldestEventAgeCallback    func() int64
}

// NewMetrics creates a new Metrics instance
func NewMetrics(logger *zap.Logger) *Metrics {
	meter := otel.Meter("relay-worker-metrics")

	m := &Metrics{
		meter:  meter,
		logger: logger,
	}

	// ════════════════════════════════════════════════════════════════
	// COUNTER: Total events published to Kafka
	// ════════════════════════════════════════════════════════════════
	eventsPublishedCounter, err := meter.Int64Counter(
		"outbox_events_published_total",
		metric.WithDescription("Total number of outbox events published to Kafka"),
		metric.WithUnit("1"),
	)
	if err != nil {
		logger.Fatal("Failed to create events published counter", zap.Error(err))
	}
	m.eventsPublishedCounter = eventsPublishedCounter

	// ════════════════════════════════════════════════════════════════
	// HISTOGRAM: Batch processing duration
	// ════════════════════════════════════════════════════════════════
	batchDurationHistogram, err := meter.Float64Histogram(
		"relay_batch_duration_seconds",
		metric.WithDescription("Duration of batch processing in seconds"),
		metric.WithUnit("s"),
	)
	if err != nil {
		logger.Fatal("Failed to create batch duration histogram", zap.Error(err))
	}
	m.batchDurationHistogram = batchDurationHistogram

	// ════════════════════════════════════════════════════════════════
	// HISTOGRAM: Kafka publish latency
	// ════════════════════════════════════════════════════════════════
	kafkaPublishHistogram, err := meter.Float64Histogram(
		"kafka_publish_duration_seconds",
		metric.WithDescription("Duration of Kafka publish operations in seconds"),
		metric.WithUnit("s"),
	)
	if err != nil {
		logger.Fatal("Failed to create kafka publish histogram", zap.Error(err))
	}
	m.kafkaPublishHistogram = kafkaPublishHistogram

	// ════════════════════════════════════════════════════════════════
	// GAUGE: Pending events in outbox (observable)
	// ════════════════════════════════════════════════════════════════
	pendingEventsGauge, err := meter.Int64ObservableGauge(
		"outbox_pending_events",
		metric.WithDescription("Number of unpublished events in outbox"),
		metric.WithUnit("1"),
	)
	if err != nil {
		logger.Fatal("Failed to create pending events gauge", zap.Error(err))
	}
	m.pendingEventsGauge = pendingEventsGauge

	// ════════════════════════════════════════════════════════════════
	// GAUGE: Oldest event age (observable)
	// ════════════════════════════════════════════════════════════════
	oldestEventAgeGauge, err := meter.Int64ObservableGauge(
		"outbox_oldest_event_age_seconds",
		metric.WithDescription("Age of the oldest unpublished event in seconds"),
		metric.WithUnit("s"),
	)
	if err != nil {
		logger.Fatal("Failed to create oldest event age gauge", zap.Error(err))
	}
	m.oldestEventAgeGauge = oldestEventAgeGauge

	// Register callbacks for observable gauges
	_, err = meter.RegisterCallback(
		m.observeMetrics,
		pendingEventsGauge,
		oldestEventAgeGauge,
	)
	if err != nil {
		logger.Fatal("Failed to register metrics callback", zap.Error(err))
	}

	logger.Info("Metrics initialized successfully")
	return m
}

// RecordEventPublished records that an event was published
func (m *Metrics) RecordEventPublished(topic string, status string) {
	m.eventsPublishedCounter.Add(context.Background(), 1,
		metric.WithAttributes(
			attribute.String("topic", topic),
			attribute.String("status", status),
		),
	)
}

// RecordBatchDuration records the duration of batch processing
func (m *Metrics) RecordBatchDuration(durationSeconds float64, eventCount int) {
	m.batchDurationHistogram.Record(context.Background(), durationSeconds,
		metric.WithAttributes(
			attribute.Int("event_count", eventCount),
		),
	)
}

// RecordKafkaPublishDuration records Kafka publish latency
func (m *Metrics) RecordKafkaPublishDuration(durationSeconds float64, topic string) {
	m.kafkaPublishHistogram.Record(context.Background(), durationSeconds,
		metric.WithAttributes(
			attribute.String("topic", topic),
		),
	)
}

// SetPendingEventsCallback sets the callback for pending events gauge
func (m *Metrics) SetPendingEventsCallback(callback func() int64) {
	m.pendingEventsCallback = callback
}

// SetOldestEventAgeCallback sets the callback for oldest event age gauge
func (m *Metrics) SetOldestEventAgeCallback(callback func() int64) {
	m.oldestEventAgeCallback = callback
}

// observeMetrics is called periodically to update observable gauges
func (m *Metrics) observeMetrics(ctx context.Context, observer metric.Observer) error {
	if m.pendingEventsCallback != nil {
		count := m.pendingEventsCallback()
		observer.ObserveInt64(m.pendingEventsGauge, count)
	}

	if m.oldestEventAgeCallback != nil {
		age := m.oldestEventAgeCallback()
		observer.ObserveInt64(m.oldestEventAgeGauge, age)
	}

	return nil
}
