package kafka

import (
	"fmt"

	"github.com/IBM/sarama"
	"go.uber.org/zap"

	"github.com/edgar-macias-se/event-driven-payments/relay/internal/config"
)

// Publisher handles publishing messages to Kafka
type Publisher struct {
	producer sarama.SyncProducer
	logger   *zap.Logger
}

// NewPublisher creates a new Kafka publisher
func NewPublisher(cfg config.KafkaConfig, logger *zap.Logger) (*Publisher, error) {
	// Parse Kafka version
	version, err := sarama.ParseKafkaVersion(cfg.Version)
	if err != nil {
		return nil, fmt.Errorf("failed to parse Kafka version: %w", err)
	}

	// Configure Sarama
	saramaConfig := sarama.NewConfig()
	saramaConfig.Version = version

	// Producer settings
	saramaConfig.Producer.RequiredAcks = sarama.WaitForAll // Wait for all in-sync replicas
	saramaConfig.Producer.Retry.Max = 3                    // Retry up to 3 times
	saramaConfig.Producer.Return.Successes = true          // Return success confirmations
	saramaConfig.Producer.Compression = sarama.CompressionSnappy // Compress messages

	// Idempotence (prevents duplicates on retry)
	saramaConfig.Producer.Idempotent = true
	saramaConfig.Producer.RequiredAcks = sarama.WaitForAll
	saramaConfig.Net.MaxOpenRequests = 1

	// Create sync producer
	producer, err := sarama.NewSyncProducer(cfg.Brokers, saramaConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create Kafka producer: %w", err)
	}

	logger.Info("Kafka producer created successfully",
		zap.Strings("brokers", cfg.Brokers),
		zap.String("version", cfg.Version),
	)

	return &Publisher{
		producer: producer,
		logger:   logger,
	}, nil
}

// Publish sends a message to Kafka
//
// Parameters:
//   - topic: Kafka topic name (e.g., "payment.paid")
//   - key: Partition key (e.g., userId) - messages with same key go to same partition
//   - data: Message payload (Protobuf bytes)
//
// Returns:
//   - partition: Which partition the message was written to
//   - offset: Position in the partition
//   - error: Any error that occurred
func (p *Publisher) Publish(topic string, key string, data []byte) (int32, int64, error) {
	// Create Kafka message
	msg := &sarama.ProducerMessage{
		Topic: topic,
		Key:   sarama.StringEncoder(key),
		Value: sarama.ByteEncoder(data),
	}

	// Send message (blocks until ACK or error)
	partition, offset, err := p.producer.SendMessage(msg)
	if err != nil {
		p.logger.Error("Failed to publish message to Kafka",
			zap.String("topic", topic),
			zap.String("key", key),
			zap.Error(err),
		)
		return 0, 0, fmt.Errorf("failed to send message: %w", err)
	}

	p.logger.Debug("Message published successfully",
		zap.String("topic", topic),
		zap.String("key", key),
		zap.Int32("partition", partition),
		zap.Int64("offset", offset),
		zap.Int("bytes", len(data)),
	)

	return partition, offset, nil
}

// Close gracefully shuts down the Kafka producer
func (p *Publisher) Close() error {
	p.logger.Info("Closing Kafka producer...")

	if err := p.producer.Close(); err != nil {
		return fmt.Errorf("failed to close producer: %w", err)
	}

	p.logger.Info("Kafka producer closed successfully")
	return nil
}
