# Payments Microservice - Event-Driven Architecture

Portfolio project demonstrating enterprise-grade microservices architecture with Clean Architecture, Transactional Outbox Pattern, and Zero Trust security principles.

**Status:** 🟡 In Development (Core functionality complete, Kafka integration pending)

---

## 🎯 Project Purpose

This project serves as a **technical showcase for senior software engineering interviews**, demonstrating:

- Deep understanding of **Clean Architecture** principles
- Implementation of **Unit of Work Pattern** with AsyncLocalStorage
- **Transactional Outbox Pattern** for eventual consistency
- **Event-driven architecture** with Kafka (KRaft mode)
- **Type-safe development** with TypeScript strict mode
- **Domain-Driven Design** with pure domain entities
- **Dependency Inversion Principle** with ports and adapters

**Target companies:** LotusFlare, enterprise software companies requiring microservices expertise.

---

## 🏗️ Architecture

### **Clean Architecture Layers**

```
┌─────────────────────────────────────────────────────────────┐
│ Infrastructure (Adapters)                                   │
│ ├── HTTP Controllers (NestJS)                              │
│ ├── TypeORM Repositories                                   │
│ ├── Kafka Publisher (pending)                              │
│ └── Prometheus Metrics (pending)                           │
└─────────────────────────────────────────────────────────────┘
                    ↓ depends on
┌─────────────────────────────────────────────────────────────┐
│ Application (Use Cases)                                     │
│ └── ProcessPaymentUseCase                                  │
│     - Orchestrates business logic                          │
│     - Uses Unit of Work for transactions                   │
└─────────────────────────────────────────────────────────────┘
                    ↓ depends on
┌─────────────────────────────────────────────────────────────┐
│ Domain (Business Logic)                                     │
│ ├── Entities (Payment, OutboxEvent)                        │
│ ├── Value Objects (PaymentStatus enum)                     │
│ └── Ports (IPaymentRepository, IOutboxRepository, IUnitOfWork)│
└─────────────────────────────────────────────────────────────┘
```

**Key Principle:** Domain layer has **ZERO dependencies** on frameworks (no TypeORM, no NestJS imports).

---

## 🔥 Implemented Patterns

### **1. Transactional Outbox Pattern**

Guarantees **atomic writes** to database and message queue without distributed transactions (2PC).

**Flow:**

```
BEGIN TRANSACTION
  ├── INSERT INTO payments (id, amount, status, ...)
  └── INSERT INTO outbox (id, name, subject, data, ...)
COMMIT

Relay Process (separate):
  ├── SELECT * FROM outbox WHERE published_at IS NULL
  ├── Publish to Kafka
  └── UPDATE outbox SET published_at = NOW()
```

**Why:** Prevents data loss if Kafka is down. Guarantees eventual consistency.

---

### **2. Unit of Work Pattern**

Manages transactions without leaking infrastructure details into application layer.

**Implementation:** Uses Node.js `AsyncLocalStorage` to provide implicit transaction context.

**Code:**

```typescript
// Application Layer (Clean)
await unitOfWork.execute(async () => {
  await paymentRepo.save(payment); // No transaction parameter
  await outboxRepo.save(event); // No transaction parameter
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

**Benefit:** Can swap TypeORM for Prisma without touching Application Layer.

---

### **3. Repository Pattern with Conditional Transactions**

Repositories support **two modes**:

- **With transaction** (inside Unit of Work) → uses EntityManager from context
- **Without transaction** (standalone queries) → uses default repository

**Code:**

```typescript
async findById(id: string): Promise<Payment | null> {
  const manager = transactionContext.get();  // May be undefined

  if (manager) {
    return manager.findOne(PaymentSchema, { where: { id } });
  } else {
    return this.repository.findOne({ where: { id } });
  }
}
```

**Why:** Read operations don't always need transactions. Write operations (save) require them.

---

## 📊 Database Design

### **Partitioning Strategy**

**Outbox table** uses PostgreSQL **RANGE partitioning** by `created_at`:

```sql
CREATE TABLE outbox (
  id UUID,
  created_at TIMESTAMPTZ,
  PRIMARY KEY (id, created_at)  -- Composite key required for partitioning
) PARTITION BY RANGE (created_at);

-- Auto-created partitions:
outbox_2026_02_06  FOR VALUES FROM ('2026-02-06') TO ('2026-02-07');
outbox_2026_02_07  FOR VALUES FROM ('2026-02-07') TO ('2026-02-08');
...
```

**Benefits:**

- **Fast cleanup:** `DROP TABLE outbox_2026_01_01` (instant vs. DELETE scan)
- **Query performance:** Partition pruning (query only relevant partition)
- **Maintenance:** VACUUM/ANALYZE per partition

**Production:** Automated script creates partitions 7 days ahead, drops partitions 30 days old.

---

### **Indexes**

```sql
-- Payments table
CREATE INDEX payments_user_id_idx ON payments (user_id);
CREATE INDEX payments_status_idx ON payments (status);
CREATE INDEX payments_created_at_idx ON payments (created_at);

-- Outbox table (partial index for Relay)
CREATE INDEX outbox_unpublished_idx ON outbox (created_at)
WHERE published_at IS NULL;
```

**Why partial index:** Relay only queries unpublished events. Index size reduced by 95%.

---

## 🛠️ Tech Stack

| Layer               | Technology     | Version     | Why                                           |
| ------------------- | -------------- | ----------- | --------------------------------------------- |
| **Framework**       | NestJS         | 11.x        | Enterprise DI, modular architecture           |
| **Language**        | TypeScript     | 5.x         | Type safety, strict mode enabled              |
| **ORM**             | TypeORM        | 0.3.x       | Mature, supports advanced PostgreSQL features |
| **Database**        | PostgreSQL     | 16          | Partitioning, BYTEA, ACID guarantees          |
| **Message Queue**   | Kafka          | 3.6 (KRaft) | High-throughput, event streaming              |
| **Serialization**   | Protobuf       | 3.x         | Compact, type-safe, cross-language            |
| **Package Manager** | pnpm           | 10.x        | Faster, stricter than npm                     |
| **Container**       | Docker Compose | 2.x         | Local dev environment                         |

---

## 🚀 Getting Started

### **Prerequisites**

```bash
node --version   # v20.x LTS
pnpm --version   # 10.x
docker --version # 28.x
```

### **Installation**

```bash
# Clone repository
git clone <repo-url>
cd payments-service

# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL + Kafka)
docker-compose up -d

# Run migrations
pnpm run migration:run

# Start application
pnpm run start:dev
```

**Application runs on:** http://localhost:3000

---

## 📡 API Endpoints

### **POST /payments** - Create Payment

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
  "paymentId": "2edc9c93-2b27-466c-a4ba-5aafdc7a5599",
  "status": "PENDING"
}
```

**Validation:**

- `userId`: Must be valid UUID
- `amount`: Must be positive integer (cents)
- `currency`: Must be 3-character ISO 4217 code

**Errors:**

- `400`: Validation failed
- `500`: Transaction failed (rollback automatic)

---

## 🧪 Testing

### **Manual E2E Test**

```bash
# 1. Create payment
curl -X POST http://localhost:3000/payments \
  -H "Content-Type: application/json" \
  -d '{"userId":"550e8400-e29b-41d4-a716-446655440000","amount":2500,"currency":"USD"}'

# 2. Verify in database
docker exec -it payments-postgres psql -U payments_user -d payments_db

# 3. Query payment
SELECT * FROM payments.payments ORDER BY created_at DESC LIMIT 1;

# 4. Query outbox event
SELECT id, name, subject, published_at FROM payments.outbox ORDER BY created_at DESC LIMIT 1;
```

**Expected:** 1 payment with status='PENDING', 1 outbox event with published_at=NULL.

---

## 📋 Implementation Checklist

### ✅ **COMPLETED (Sessions 1-4)**

- [x] Project setup with NestJS + TypeScript strict mode
- [x] Environment variable validation with type safety
- [x] Docker Compose (PostgreSQL 16 + Kafka 3.6 KRaft)
- [x] TypeORM configuration with migrations
- [x] Database schemas with partitioning
- [x] Domain entities (Payment, OutboxEvent) - pure TypeScript
- [x] Domain ports (interfaces for repositories, Unit of Work)
- [x] TypeORM schemas (separate from domain entities)
- [x] Unit of Work implementation with AsyncLocalStorage
- [x] Transaction context management
- [x] Payment repository with conditional transactions
- [x] Outbox repository with conditional transactions
- [x] Persistence module with dependency injection
- [x] ProcessPayment use case with Transactional Outbox
- [x] Payment controller (HTTP REST API)
- [x] Application module (use case registration)
- [x] HTTP module (controller registration)
- [x] End-to-end test validation ✅

---

### 🟡 **IN PROGRESS (Session 5)**

- [ ] **Kafka Integration**
  - [ ] KafkaJS producer configuration with mTLS
  - [ ] Event publisher implementation (IEventPublisher port)
  - [ ] Kafka module with dependency injection
  - [ ] Integration test: Use Case → Kafka topic

- [ ] **Relay Service (Outbox Processor)**
  - [ ] Scheduled job (polls every 500ms)
  - [ ] Batch processing (50 events per iteration)
  - [ ] Retry logic (3 attempts with exponential backoff)
  - [ ] Mark events as published after Kafka ACK
  - [ ] Error handling (dead letter queue)

---

### 🔴 **PENDING (Sessions 6-10)**

#### **Session 6: Protobuf Serialization**

- [ ] Define .proto schemas (PaymentCreatedEvent)
- [ ] Generate TypeScript code with protoc
- [ ] Replace JSON serialization with Protobuf
- [ ] Update Use Case to use Protobuf encoder
- [ ] Update Relay to handle binary data

#### **Session 7: Observability (Prometheus Metrics)**

- [ ] Metrics module with Prometheus client
- [ ] Counter: `payment_processed_total`
- [ ] Gauge: `outbox_pending_events`
- [ ] Gauge: `outbox_oldest_event_age_seconds`
- [ ] Histogram: `payment_transaction_duration_seconds`
- [ ] Expose `/metrics` endpoint
- [ ] Grafana dashboard configuration

#### **Session 8: Security (mTLS + Validation)**

- [ ] Generate SSL certificates for Kafka
- [ ] Configure KafkaJS with mTLS
- [ ] Implement ACL validation
- [ ] Add rate limiting (express-rate-limit)
- [ ] Input sanitization (helmet, hpp)
- [ ] Security headers configuration

#### **Session 9: Testing**

- [ ] Unit tests (Domain entities)
- [ ] Integration tests (Repositories with test DB)
- [ ] E2E tests (Full flow with TestContainers)
- [ ] Load tests (Artillery or k6)

#### **Session 10: DevOps**

- [ ] Dockerfile (multi-stage build)
- [ ] Kubernetes manifests (deployment, service, configmap)
- [ ] Helm chart
- [ ] GitHub Actions CI/CD pipeline
- [ ] Terraform for infrastructure (optional)

---

## 🎓 Learning Outcomes

This project demonstrates:

✅ **Architectural Patterns**

- Clean Architecture (Hexagonal/Ports & Adapters)
- Unit of Work Pattern
- Repository Pattern
- Transactional Outbox Pattern
- Domain-Driven Design

✅ **Advanced TypeScript**

- Strict mode configuration
- Definite assignment assertion (`!`)
- Generic types in Unit of Work
- Type-safe dependency injection

✅ **Database Expertise**

- PostgreSQL partitioning
- Partial indexes for performance
- Composite primary keys
- Migration management
- ACID transaction guarantees

✅ **System Design**

- Event-driven architecture
- Eventual consistency
- Idempotency considerations
- Fault tolerance (retry logic, dead letter queues)

✅ **Professional Practices**

- Dependency Inversion Principle (SOLID)
- Separation of concerns
- Type safety over runtime errors
- Documentation-first approach

---

## 📚 References

### **Books Used (Available in Project Context)**

- _Event-Driven Architecture in Golang_ - Patterns and practices
- _Building Event-Driven Microservices_ - Kafka best practices
- _Kubernetes: Up and Running_ - Container orchestration
- _Terraform: Up and Running_ - Infrastructure as Code
- _Learning GitHub Actions_ - CI/CD automation
- _Learning DevSecOps_ - Security integration

### **Governance Documents**

- `governance.md` - Architectural decisions and standards
- `threat_library.md` - Security threat modeling
- `secure_stack.md` - Security controls and mitigations

---

## 🤝 Interview Talking Points

**When presenting this project:**

1. **"Why Unit of Work instead of passing transactionManager?"**

   > "I chose Unit of Work to keep the Application Layer independent of TypeORM. Using AsyncLocalStorage adds complexity, but it means I can swap to Prisma without touching any use cases. This follows the Dependency Inversion Principle strictly."

2. **"Why Transactional Outbox instead of publishing directly to Kafka?"**

   > "Outbox Pattern guarantees exactly-once delivery semantics without distributed transactions. If Kafka is down, the payment still succeeds, and the event publishes later. This is critical for financial systems where data consistency matters more than real-time delivery."

3. **"Why separate Domain entities from TypeORM schemas?"**

   > "It's about maintainability. My domain logic doesn't care about ORM decorators. If I switch from TypeORM to Prisma, I only modify the infrastructure layer. The domain remains pure TypeScript with zero framework dependencies."

4. **"How does this scale?"**
   > "The Relay can run multiple instances (horizontal scaling). Each instance polls different partition ranges. The outbox table is partitioned by date, so old events can be dropped instantly. Kafka handles message ordering per partition using the userId as the key."

---

## 📞 Contact

**Developer:** Edgar (Homz) Macias  
**Purpose:** Technical interview portfolio  
**Target Role:** Senior Software Engineer - Microservices

---

## 📄 License

This is a portfolio project for educational and interview purposes.
