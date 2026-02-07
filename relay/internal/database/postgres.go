package database

import (
	"database/sql"
	"fmt"

	_ "github.com/lib/pq" // PostgreSQL driver

	"github.com/edgar-macias-se/event-driven-payments/relay/internal/config"
)

// Connect establishes a connection to PostgreSQL
func Connect(cfg config.DatabaseConfig) (*sql.DB, error) {
	// Build connection string
	connStr := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		cfg.Host,
		cfg.Port,
		cfg.User,
		cfg.Password,
		cfg.Database,
	)

	// Open connection
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Test connection
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Configure connection pool
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)

	return db, nil
}
