package config

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

// Config holds all configuration for the relay service
type Config struct {
	Database DatabaseConfig
	Kafka    KafkaConfig
	Relay    RelayConfig
}

// DatabaseConfig holds PostgreSQL connection details
type DatabaseConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	Database string
}

// KafkaConfig holds Kafka connection details
type KafkaConfig struct {
	Brokers []string
	Version string
}

// RelayConfig holds relay-specific settings
type RelayConfig struct {
	PollingInterval time.Duration
	BatchSize       int
	MaxRetries      int
}

// Load reads configuration from environment variables
func Load() (*Config, error) {
	// Load .env file (if exists, ignore error in production)
	_ = godotenv.Load("../.env")

	// Parse database port
	dbPort, err := strconv.Atoi(getEnv("DB_PORT", "5432"))
	if err != nil {
		return nil, fmt.Errorf("invalid DB_PORT: %w", err)
	}

	// Parse relay settings
	pollingIntervalMs, err := strconv.Atoi(getEnv("RELAY_POLLING_INTERVAL_MS", "500"))
	if err != nil {
		return nil, fmt.Errorf("invalid RELAY_POLLING_INTERVAL_MS: %w", err)
	}

	batchSize, err := strconv.Atoi(getEnv("RELAY_BATCH_SIZE", "50"))
	if err != nil {
		return nil, fmt.Errorf("invalid RELAY_BATCH_SIZE: %w", err)
	}

	maxRetries, err := strconv.Atoi(getEnv("RELAY_MAX_RETRIES", "3"))
	if err != nil {
		return nil, fmt.Errorf("invalid RELAY_MAX_RETRIES: %w", err)
	}

	config := &Config{
		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     dbPort,
			User:     getEnv("DB_USERNAME", "payments_user"),
			Password: getEnv("DB_PASSWORD", "payments_pass"),
			Database: getEnv("DB_DATABASE", "payments_db"),
		},
		Kafka: KafkaConfig{
			Brokers: []string{getEnv("KAFKA_BROKERS", "localhost:9092")},
			Version: "3.6.0",
		},
		Relay: RelayConfig{
			PollingInterval: time.Duration(pollingIntervalMs) * time.Millisecond,
			BatchSize:       batchSize,
			MaxRetries:      maxRetries,
		},
	}

	return config, nil
}

// getEnv reads an environment variable or returns a default value
func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}
