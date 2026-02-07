package outbox

import (
	"database/sql"
	"fmt"
	"time"
)

// Event represents an outbox event from the database
type Event struct {
	ID          string
	Name        string
	Subject     string
	Data        []byte
	PublishedAt *time.Time
	CreatedAt   time.Time
}

// Repository handles outbox database operations
type Repository struct {
	db *sql.DB
}

// NewRepository creates a new outbox repository
func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// FindUnpublished retrieves unpublished events from the outbox
//
// Query:
//   SELECT id, name, subject, data, created_at
//   FROM payments.outbox
//   WHERE published_at IS NULL
//   ORDER BY created_at ASC
//   LIMIT ?
func (r *Repository) FindUnpublished(limit int) ([]Event, error) {
	query := `
		SELECT id, name, subject, data, created_at
		FROM payments.outbox
		WHERE published_at IS NULL
		ORDER BY created_at ASC
		LIMIT $1
	`

	rows, err := r.db.Query(query, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to query unpublished events: %w", err)
	}
	defer rows.Close()

	var events []Event

	for rows.Next() {
		var event Event

		err := rows.Scan(
			&event.ID,
			&event.Name,
			&event.Subject,
			&event.Data,
			&event.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan event: %w", err)
		}

		events = append(events, event)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating rows: %w", err)
	}

	return events, nil
}

// MarkAsPublished updates an event's published_at timestamp
//
// Query:
//   UPDATE payments.outbox
//   SET published_at = NOW()
//   WHERE id = ?
func (r *Repository) MarkAsPublished(eventID string) error {
	query := `
		UPDATE payments.outbox
		SET published_at = NOW()
		WHERE id = $1
	`

	result, err := r.db.Exec(query, eventID)
	if err != nil {
		return fmt.Errorf("failed to mark event as published: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("event not found: %s", eventID)
	}

	return nil
}

// CountPending returns the number of unpublished events
func (r *Repository) CountPending() (int, error) {
	query := `
		SELECT COUNT(*)
		FROM payments.outbox
		WHERE published_at IS NULL
	`

	var count int
	err := r.db.QueryRow(query).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count pending events: %w", err)
	}

	return count, nil
}
