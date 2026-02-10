# Event-Driven Payments - Microservices Architecture

Microservices system demonstrating enterprise-grade architecture with Clean Architecture, Transactional Outbox Pattern, and polyglot implementation (TypeScript + Go).

**Status:** 🟢 Core System Complete | 🟡 Consumer Service In Progress

---

## 🎯 Project Overview

This project demonstrates:

- **Clean Architecture** with strict layer separation
- **Unit of Work Pattern** using AsyncLocalStorage
- **Transactional Outbox Pattern** for eventual consistency
- **Event-driven architecture** with Kafka (KRaft mode)
- **Polyglot microservices** (TypeScript for business logic, Go for infrastructure workers)
- **Type-safe development** with TypeScript strict mode and Go
- **Domain-Driven Design** with pure domain entities
- **Dependency Inversion Principle** with ports and adapters

---

## 🏗️ System Architecture

### **Service Topology**

```
┌─────────────────────────────────────────────────────────────┐
│ PAYMENT BOUNDED CONTEXT                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Payment API (NestJS/TypeScript)                           │
│  ├── HTTP REST endpoints                                   │
│  ├── Clean Architecture (Domain/Application/Infrastructure)│
│  ├── Unit of Work + Transactional Outbox                  │
│  └── PostgreSQL (payments + outbox tables)                │
│                    ↓ writes to DB                           │
│  Relay Worker (Go)                                         │
│  ├── Infrastructure worker (no business logic)            │
│  ├── Polls outbox every 500ms                             │
│  ├── Batch processing (50 events)                         │
│  ├── Publishes to Kafka with durability guarantees       │
│  └── Graceful shutdown                                     │
│                    ↓ publishes to                           │
│  Kafka Topics                                              │
│  └── payment.paid                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ SUBSCRIPTION BOUNDED CONTEXT (In Progress)                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Subscription Service (NestJS/TypeScript)                  │
│  ├── Kafka consumer (payment.paid topic)                  │
│  ├── ActivateSubscription Use Case                        │
│  ├── State machine (TRIAL → ACTIVE → SUSPENDED)           │
│  └── PostgreSQL (subscriptions DB)                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### **Clean Architecture Layers**

```
┌─────────────────────────────────────────────────────────────┐
│ Infrastructure (Adapters)                                   │
│ ├── HTTP Controllers (NestJS)                              │
│ ├── TypeORM Repositories                                   │
│ ├── Kafka Producer (Sarama - Go)                          │
│ └── Kafka Consumer (KafkaJS - pending)                    │
└─────────────────────────────────────────────────────────────┘
                    ↓ depends on
┌─────────────────────────────────────────────────────────────┐
│ Application (Use Cases)                                     │
│ ├── ProcessPaymentUseCase                                 │
│ └── ActivateSubscriptionUseCase (pending)                 │
└─────────────────────────────────────────────────────────────┘
                    ↓ depends on
┌─────────────────────────────────────────────────────────────┐
│ Domain (Business Logic)                                     │
│ ├── Entities (Payment, OutboxEvent, Subscription)         │
│ ├── Value Objects (PaymentStatus, SubscriptionStatus)     │
│ └── Ports (Repositories, Unit of Work)                    │
└─────────────────────────────────────────────────────────────┘
```

**Key Principle:** Domain layer has **ZERO dependencies** on frameworks.

---

## 🔥 Implemented Patterns

### **1. Transactional Outbox Pattern**

Guarantees atomic writes to database and message queue without distributed transactions (2PC).

**Flow:**

```
Payment API:
  BEGIN TRANSACTION
    ├── INSERT INTO payments.payments (id, amount, status, ...)
    └── INSERT INTO payments.outbox (id, name, subject, data, ...)
  COMMIT

Relay Worker (separate process):
  ├── SELECT * FROM outbox WHERE published_at IS NULL (every 500ms)
  ├── Publish to Kafka with WaitForAll (durability guarantee)
  └── UPDATE outbox SET published_at = NOW()
```

**Why:** Prevents data loss if Kafka is down. Payment API remains available even when Kafka is unavailable.

---

### **2. Unit of Work Pattern**

Manages transactions without leaking infrastructure details into application layer.

**Implementation:** Uses Node.js `AsyncLocalStorage` to provide implicit transaction context.

```typescript
// Application Layer (Clean)
await unitOfWork.execute(async () => {
  await paymentRepo.save(payment); // No transaction parameter
  await outboxRepo.save(event); // No transaction parameter
  // Both operations share same transaction automatically
});

// Infrastructure Layer (TypeORM)
class TypeORMUnitOfWork {
  async execute<T>(work: () => Promise<T>): Promise<T> {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.startTransaction();

    return transactionContext.run(queryRunner.manager, async () => {
      const result = await work(); // Repositories read manager from context
      await queryRunner.commitTransaction();
      return result;
    });
  }
}
```

**Benefit:** Application layer remains ORM-agnostic. Can swap TypeORM for Prisma without changing use cases.

---

### **3. Polyglot Architecture**

Different technologies chosen based on specific requirements:

| Service                  | Technology        | Why                                                                     |
| ------------------------ | ----------------- | ----------------------------------------------------------------------- |
| **Payment API**          | TypeScript/NestJS | Complex business logic, rich type system, rapid development             |
| **Relay Worker**         | Go                | Simple polling logic, high throughput (50k events/s), low memory (25MB) |
| **Subscription Service** | TypeScript/NestJS | Complex state machines, domain-rich, code reuse with Payment API        |

**Principle:** Use the right tool for each bounded context, not one technology for everything.

---

## 📊 Database Design

### **Table Partitioning**

**Outbox table** uses PostgreSQL **RANGE partitioning** by `created_at`:

```sql
CREATE TABLE payments.outbox (
  id UUID NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  data BYTEA NOT NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)  -- Composite key includes partition key
) PARTITION BY RANGE (created_at);

-- Daily partitions auto-created by migration
CREATE TABLE payments.outbox_2026_02_07
  PARTITION OF payments.outbox
  FOR VALUES FROM ('2026-02-07') TO ('2026-02-08');
```

**Benefits:**

- **Fast cleanup:** `DROP TABLE outbox_2026_01_01` (instant vs. full table scan)
- **Query performance:** Partition pruning (query only relevant dates)
- **Maintenance:** VACUUM/ANALYZE per partition instead of entire table

---

### **Indexes**

```sql
-- Payments table
CREATE INDEX payments_user_id_idx ON payments (user_id);
CREATE INDEX payments_status_idx ON payments (status);
CREATE INDEX payments_created_at_idx ON payments (created_at);

-- Outbox table (partial index)
CREATE INDEX outbox_unpublished_idx ON outbox (created_at)
WHERE published_at IS NULL;
```

**Partial index rationale:** Relay only queries unpublished events. Index excludes 95% of rows (already published), dramatically reducing index size and improving query speed.

---

## 🛠️ Tech Stack

### **Payment API Service**

| Component       | Technology      | Version           |
| --------------- | --------------- | ----------------- |
| Framework       | NestJS          | 11.x              |
| Language        | TypeScript      | 5.x (strict mode) |
| ORM             | TypeORM         | 0.3.x             |
| Database        | PostgreSQL      | 16                |
| Validation      | class-validator | Latest            |
| Package Manager | pnpm            | 10.x              |

### **Relay Worker**

| Component         | Technology   | Version |
| ----------------- | ------------ | ------- |
| Language          | Go           | 1.21+   |
| Kafka Client      | Sarama (IBM) | 1.42+   |
| PostgreSQL Driver | lib/pq       | 1.10+   |
| Logging           | zap (Uber)   | 1.26+   |

### **Infrastructure**

| Component               | Technology             | Version |
| ----------------------- | ---------------------- | ------- |
| Message Broker          | Kafka (KRaft)          | 3.6     |
| Database                | PostgreSQL             | 16      |
| Containerization        | Docker Compose         | 2.x     |
| **Observability**       |                        |         |
| Telemetry SDK           | OpenTelemetry          | 1.x     |
| Metrics Backend         | Prometheus             | 2.48    |
| Traces Backend          | Jaeger                 | 1.52    |
| Logs Backend            | Loki                   | 2.9     |
| Visualization           | Grafana                | 10.2    |
| Collector               | OTel Collector Contrib | 0.91    |
| Serialization (planned) | Protobuf               | 3.x     |

---

## 🚀 Getting Started

### **Prerequisites**

```bash
node --version   # v20.x LTS
pnpm --version   # 10.x
go version       # 1.21+
docker --version # 20.x+
```

### **Installation**

```bash
# Clone repository
git clone https://github.com/edgar-macias-se/event-driven-payments.git
cd event-driven-payments

# Install Payment API dependencies
cd api
pnpm install

# Start infrastructure (PostgreSQL + Kafka)
docker-compose up -d

# Wait for services to be healthy
docker-compose ps

# Run database migrations
pnpm run migration:run

# Start Payment API
pnpm run start:dev
```

**Payment API runs on:** http://localhost:3000

### **Running the Relay Worker**

```bash
# In a separate terminal
cd relay

# Build binary
go build -o bin/relay ./cmd/relay

# Run relay
./bin/relay
```

---

## 📡 API Endpoints

### **POST /payments** - Create Payment

Creates a payment and emits a PaymentCreated event to Kafka.

**Request:**

```bash
curl -X POST http://localhost:3000/payments \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "amount": 2500,
    "currency": "USD"
  }'
```

**Response (201 Created):**

```json
{
  "paymentId": "87f8b3f6-ada9-43b9-ba1d-7c128e7b8e14",
  "status": "PENDING"
}
```

**Validation:**

- `userId`: Must be valid UUID
- `amount`: Must be positive integer (cents, e.g., 2500 = $25.00)
- `currency`: Must be 3-character ISO 4217 code (USD, EUR, MXN, etc.)

**Status Codes:**

- `201`: Payment created successfully
- `400`: Validation failed
- `500`: Internal error (transaction rolled back automatically)

---

## 🧪 End-to-End Testing

### **Complete Flow Test**

```bash
# Terminal 1: Start Payment API
cd api
pnpm run start:dev

# Terminal 2: Start Relay Worker
cd relay
./bin/relay

# Terminal 3: Create payment
curl -X POST http://localhost:3000/payments \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "amount": 5000,
    "currency": "USD"
  }'

# Expected logs:

# Payment API (Terminal 1):
# [PaymentController] Received payment request
# [TypeORMUnitOfWork] Transaction started
# [ProcessPaymentUseCase] Payment saved: xxx
# [ProcessPaymentUseCase] Outbox event saved: yyy
# [TypeORMUnitOfWork] Transaction committed

# Relay Worker (Terminal 2):
# {"level":"info","msg":"Processing batch","count":1}
# {"level":"info","msg":"Event published successfully","topic":"payment.paid","partition":0}
# {"level":"info","msg":"Batch processed","success":1,"errors":0}
```

### **Database Verification**

```bash
# Connect to PostgreSQL
docker exec -it payments-postgres psql -U payments_user -d payments_db

# Verify payment
SELECT id, user_id, amount, status, created_at
FROM payments.payments
ORDER BY created_at DESC LIMIT 1;

# Verify outbox event (should have published_at timestamp)
SELECT id, name, subject, published_at, created_at
FROM payments.outbox
ORDER BY created_at DESC LIMIT 1;

# Verify event was published
SELECT id, published_at IS NOT NULL as published
FROM payments.outbox
WHERE published_at IS NOT NULL
ORDER BY created_at DESC LIMIT 1;
```

---

## 📋 Project Status

### ✅ **COMPLETED (Sessions 1-6)**

**Payment Bounded Context**

- [x] NestJS project with TypeScript strict mode
- [x] Environment variable validation
- [x] Docker Compose setup (PostgreSQL + Kafka KRaft)
- [x] TypeORM configuration with migrations
- [x] Database schemas with table partitioning
- [x] Domain entities (Payment, OutboxEvent) - framework-free
- [x] Domain ports (IPaymentRepository, IOutboxRepository, IUnitOfWork)
- [x] TypeORM schemas (separated from domain)
- [x] Unit of Work implementation with AsyncLocalStorage
- [x] Transaction context management
- [x] Repositories with conditional transaction support
- [x] ProcessPayment use case
- [x] Payment REST controller
- [x] Dependency injection configuration

**Relay Worker (Go)**

- [x] Outbox polling with configurable interval (500ms)
- [x] Batch processing (50 events per iteration)
- [x] Kafka producer with Sarama
- [x] Durability guarantee (RequiredAcks = WaitForAll)
- [x] Structured logging with zap
- [x] Graceful shutdown with context cancellation

**Observability (OpenTelemetry) - Session 6** ✅

- [x] OpenTelemetry Collector configured
- [x] Prometheus for metrics (time-series DB)
- [x] Jaeger for distributed tracing
- [x] Loki for log aggregation
- [x] Grafana with unified dashboards
- [x] Payment API instrumented (TypeScript)
  - [x] Auto-instrumentation (HTTP, TypeORM)
  - [x] Custom metrics (payments_processed_total, payment_duration_seconds)
  - [x] Custom spans (ProcessPaymentUseCase)
  - [x] Export via OTLP protocol
- [x] Relay Worker instrumented (Go)
  - [x] Custom metrics (outbox_events_published_total, outbox_pending_events, kafka_publish_duration_seconds)
  - [x] Custom spans (batch processing, event publishing)
  - [x] Observable gauges (pending events, oldest event age)
  - [x] Export via OTLP protocol
- [x] Grafana Dashboards
  - [x] Payment Service Overview
  - [x] Relay Worker Health
  - [x] System Overview (unified)
- [x] Trace/Log/Metric correlation via trace_id
- [x] End-to-End validated ✅

---

### 🟡 **IN PROGRESS**

**Subscription Bounded Context (Session 6)**

- [ ] Subscription domain entities
- [ ] ActivateSubscription use case
- [ ] Kafka consumer with KafkaJS
- [ ] Idempotency with processed_events table
- [ ] State machine (TRIAL → ACTIVE → SUSPENDED → EXPIRED)
- [ ] PostgreSQL schema (subscriptions database)
- [ ] OpenTelemetry instrumentation

---

### 🔴 **PLANNED**

**Session 7: Protobuf Serialization**

- [ ] Define .proto schemas (PaymentCreatedEvent)
- [ ] Generate TypeScript and Go code
- [ ] Replace JSON with Protobuf in outbox data
- [ ] Update Payment API serialization
- [ ] Update Relay deserialization

**Session 8: Observability**

- [ ] Prometheus metrics endpoints
- [ ] Counters (payments_processed_total)
- [ ] Gauges (outbox_pending_events, outbox_oldest_event_age)
- [ ] Histograms (payment_duration_seconds)
- [ ] Grafana dashboards

**Session 9: Security & Testing**

- [ ] mTLS for Kafka connections
- [ ] Unit tests (domain entities)
- [ ] Integration tests (repositories with test DB)
- [ ] E2E tests (full flow with TestContainers)
- [ ] Load testing (k6 or Artillery)

**Session 10: DevOps**

- [ ] Multi-stage Dockerfiles
- [ ] Kubernetes manifests
- [ ] Helm charts
- [ ] GitHub Actions CI/CD pipeline

---

## 📊 **Observability Stack**

### **Architecture**

```
Payment API (NestJS) ──┐
                       ├─→ OpenTelemetry Collector ──┬─→ Prometheus (metrics)
Relay Worker (Go) ─────┘                            ├─→ Jaeger (traces)
                                                     └─→ Loki (logs)
                                                          ↓
                                                     Grafana (visualization)
```

### **Access URLs**

- **Grafana:** http://localhost:3001 (admin/admin)
- **Prometheus:** http://localhost:9090
- **Jaeger UI:** http://localhost:16686
- **OTel Collector:** localhost:4317 (gRPC), localhost:4318 (HTTP)

### **Key Metrics**

**Payment API:**

- `payments_processed_total` - Counter of payments by status/currency
- `payment_transaction_duration_seconds` - Histogram of transaction latency
- `outbox_events_created_total` - Counter of outbox events

**Relay Worker:**

- `outbox_events_published_total` - Counter of events published by topic/status
- `outbox_pending_events` - Gauge of unpublished events
- `outbox_oldest_event_age_seconds` - Gauge of oldest unpublished event age
- `relay_batch_duration_seconds` - Histogram of batch processing time
- `kafka_publish_duration_seconds` - Histogram of Kafka publish latency

### **Dashboards**

1. **Payment Service Overview**
   - Payments per minute
   - Success rate (%)
   - P99 latency
   - Outbox events created

2. **Relay Worker Health**
   - Events published per minute
   - Pending events (gauge)
   - Oldest event age
   - Kafka publish latency (p50/p95/p99)
   - Batch processing duration

3. **System Overview**
   - Unified view of Payment API + Relay Worker
   - End-to-end latency
   - Error rates
   - Total throughput

### **Correlation Example**

When debugging a failed payment:

1. **Grafana:** Detect spike in error rate (dashboard)
2. **Jaeger:** Find trace with error status (trace_id: abc123)
3. **Loki:** View logs with same trace_id
4. **Result:** Complete picture of what failed and why

**Query in Loki:**

```
{service="payment-api"} |= "abc123"
```

**Query in Prometheus:**

```promql
rate(payments_processed_total{status="failed"}[5m])
```

## 🎓 Key Learnings

### **Architectural Patterns**

- Clean Architecture with strict layer boundaries
- Unit of Work Pattern for transaction management
- Repository Pattern with transaction context
- Transactional Outbox Pattern for eventual consistency
- Domain-Driven Design principles
- Polyglot microservices architecture

### **TypeScript Advanced**

- Strict mode configuration and benefits
- AsyncLocalStorage for request-scoped context
- Generic types in infrastructure patterns
- Dependency injection with NestJS

### **Go Fundamentals**

- Goroutines and channels for concurrency
- Context for cancellation and timeouts
- Select for multiplexing multiple channels
- Defer for guaranteed cleanup
- Structured logging with zap
- Error wrapping with fmt.Errorf

### **Database Design**

- PostgreSQL table partitioning strategies
- Partial indexes for query optimization
- Composite primary keys in partitioned tables
- Migration-based schema management
- Connection pooling configuration

### **System Design**

- Event-driven architecture patterns
- Eventual consistency guarantees
- At-least-once delivery semantics
- Idempotency considerations
- Graceful shutdown patterns
- Bounded context separation

### **Observability & OpenTelemetry**

- OpenTelemetry SDK integration (TypeScript + Go)
- OTLP protocol (gRPC export)
- Auto-instrumentation patterns (HTTP, Database, Kafka)
- Custom metrics (Counters, Gauges, Histograms)
- Custom spans and trace context propagation
- Distributed tracing across polyglot services
- Metrics collection with Prometheus
- Log aggregation with Loki
- Trace visualization with Jaeger
- Unified dashboards in Grafana
- Correlation via trace_id (logs + metrics + traces)
- Observable gauges with callbacks
- PromQL query language

---

## 📚 References

**Books (Available in Project Context):**

- _Event-Driven Architecture in Golang_
- _Building Event-Driven Microservices_
- _Kubernetes: Up and Running_
- _Terraform: Up and Running_
- _Learning GitHub Actions_
- _Learning DevSecOps_

---

## 📄 License

This is an educational project demonstrating microservices architecture patterns.

---

## 🤝 Contributing

This is a portfolio project. Feel free to fork and adapt the patterns for your own learning.
