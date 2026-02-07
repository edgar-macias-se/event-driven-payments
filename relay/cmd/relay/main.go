package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"go.uber.org/zap"

	"github.com/edgar-macias-se/event-driven-payments/relay/internal/config"
	"github.com/edgar-macias-se/event-driven-payments/relay/internal/database"
	"github.com/edgar-macias-se/event-driven-payments/relay/internal/kafka"
	"github.com/edgar-macias-se/event-driven-payments/relay/internal/outbox"
)

func main() {
	// Initialize logger
	logger, err := zap.NewProduction()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	logger.Info("Starting Relay Service")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		logger.Fatal("Failed to load configuration", zap.Error(err))
	}

	// Connect to PostgreSQL
	db, err := database.Connect(cfg.Database)
	if err != nil {
		logger.Fatal("Failed to connect to database", zap.Error(err))
	}
	defer db.Close()

	logger.Info("Connected to PostgreSQL",
		zap.String("host", cfg.Database.Host),
		zap.Int("port", cfg.Database.Port),
	)

	// Create Kafka publisher
	publisher, err := kafka.NewPublisher(cfg.Kafka, logger)
	if err != nil {
		logger.Fatal("Failed to create Kafka publisher", zap.Error(err))
	}
	defer publisher.Close()

	// Create outbox repository and poller
	repo := outbox.NewRepository(db)
	poller := outbox.NewPoller(repo, publisher, cfg.Relay, logger)

	// Context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle OS signals (SIGINT, SIGTERM)
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	// Start poller in goroutine
	errChan := make(chan error, 1)
	go func() {
		errChan <- poller.Start(ctx)
	}()

	// Wait for shutdown signal or error
	select {
	case sig := <-sigChan:
		logger.Info("Received shutdown signal", zap.String("signal", sig.String()))
		cancel() // Cancel context to stop poller

	case err := <-errChan:
		if err != nil && err != context.Canceled {
			logger.Error("Poller stopped with error", zap.Error(err))
		}
	}

	logger.Info("Relay Service stopped gracefully")
}
