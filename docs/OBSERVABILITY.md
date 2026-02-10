# Observability Architecture

Complete observability implementation using OpenTelemetry, Prometheus, Jaeger, Loki, and Grafana.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Applications                                                │
│ ├── Payment API (NestJS/TypeScript)                       │
│ │   └── OpenTelemetry SDK                                 │
│ └── Relay Worker (Go)                                      │
│     └── OpenTelemetry SDK                                  │
└─────────────────────────────────────────────────────────────┘
                    ↓ OTLP (gRPC)
┌─────────────────────────────────────────────────────────────┐
│ OpenTelemetry Collector                                     │
│ ├── Receivers (OTLP gRPC/HTTP)                            │
│ ├── Processors (Batch, Resource, Memory Limiter)          │
│ └── Exporters (Prometheus, Jaeger, Loki)                  │
└─────────────────────────────────────────────────────────────┘
         ↓               ↓               ↓
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Prometheus   │ │ Jaeger       │ │ Loki         │
│ (Metrics)    │ │ (Traces)     │ │ (Logs)       │
└──────────────┘ └──────────────┘ └──────────────┘
         ↓               ↓               ↓
┌─────────────────────────────────────────────────────────────┐
│ Grafana                                                      │
│ - Unified visualization                                     │
│ - Correlation by trace_id                                   │
│ - Pre-built dashboards                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 The Three Pillars

### **1. Metrics (Prometheus)**

Numerical measurements over time.

**Examples:**

- `payments_processed_total{status="success"}` → How many payments succeeded?
- `outbox_pending_events` → How many events are waiting to be published?
- `histogram_quantile(0.99, payment_duration_seconds_bucket)` → What's the p99 latency?

**When to use:** Monitoring trends, alerting on thresholds, capacity planning.

---

### **2. Traces (Jaeger)**

Detailed execution flow of requests across services.

**Example Trace:**

```
POST /payments (trace_id: abc123) - 245ms
  ├── ProcessPaymentUseCase - 235ms
  │   ├── paymentRepo.save() - 120ms
  │   │   └── PostgreSQL INSERT - 115ms
  │   └── outboxRepo.save() - 95ms
  │       └── PostgreSQL INSERT - 90ms
  └── Response serialization - 10ms
```

**When to use:** Debugging slow requests, finding bottlenecks, understanding dependencies.

---

### **3. Logs (Loki)**

Textual event records with context.

**Example Log:**

```json
{
  "timestamp": "2026-02-07T20:30:15Z",
  "level": "ERROR",
  "message": "Payment processing failed",
  "trace_id": "abc123",
  "user_id": "user-456",
  "error": "Insufficient funds"
}
```

**When to use:** Debugging specific errors, auditing, compliance.

---

## 🔗 Correlation: The Magic of trace_id

All three pillars are connected via `trace_id`:

```
1. Grafana Dashboard shows spike in error rate
   ↓
2. Click on spike → See metric: payments_processed_total{status="failed"}
   ↓
3. Navigate to Jaeger with time range
   ↓
4. Find traces with status=error → trace_id: abc123
   ↓
5. Click "View Logs" in Jaeger
   ↓
6. Loki shows logs: {service="payment-api"} |= "abc123"
   ↓
7. See full stack trace and error details
```

**Result:** From "error rate increased" to "root cause identified" in 30 seconds.

---

## 📈 Key Metrics Reference

### **Payment API Metrics**

| Metric                                 | Type      | Labels               | Description                |
| -------------------------------------- | --------- | -------------------- | -------------------------- |
| `payments_processed_total`             | Counter   | `status`, `currency` | Total payments processed   |
| `payment_transaction_duration_seconds` | Histogram | `status`             | Payment processing latency |
| `outbox_events_created_total`          | Counter   | `event_name`         | Outbox events created      |

### **Relay Worker Metrics**

| Metric                            | Type      | Labels            | Description                     |
| --------------------------------- | --------- | ----------------- | ------------------------------- |
| `outbox_events_published_total`   | Counter   | `topic`, `status` | Events published to Kafka       |
| `outbox_pending_events`           | Gauge     | -                 | Unpublished events count        |
| `outbox_oldest_event_age_seconds` | Gauge     | -                 | Age of oldest unpublished event |
| `relay_batch_duration_seconds`    | Histogram | `event_count`     | Batch processing duration       |
| `kafka_publish_duration_seconds`  | Histogram | `topic`           | Kafka publish latency           |

---

## 📊 PromQL Query Examples

### **Traffic**

```promql
# Payments per minute
rate(payments_processed_total{status="success"}[1m]) * 60

# Events published per second
rate(outbox_events_published_total[1m])
```

### **Error Rate**

```promql
# Payment error rate (%)
sum(rate(payments_processed_total{status="failed"}[5m]))
/
sum(rate(payments_processed_total[5m])) * 100
```

### **Latency**

```promql
# P99 payment latency
histogram_quantile(0.99,
  rate(payment_transaction_duration_seconds_bucket[5m])
)

# P50, P95, P99 Kafka publish latency
histogram_quantile(0.50, rate(kafka_publish_duration_seconds_bucket[5m]))
histogram_quantile(0.95, rate(kafka_publish_duration_seconds_bucket[5m]))
histogram_quantile(0.99, rate(kafka_publish_duration_seconds_bucket[5m]))
```

### **Saturation**

```promql
# Pending events (should be low)
outbox_pending_events

# Oldest event age (alert if > 300s)
outbox_oldest_event_age_seconds > 300
```

---

## 🚨 Alerting Rules (Example)

**Create:** `observability/prometheus-alerts.yml`

```yaml
groups:
  - name: payment_alerts
    interval: 30s
    rules:
      # High error rate
      - alert: HighPaymentErrorRate
        expr: |
          (sum(rate(payments_processed_total{status="failed"}[5m])) 
          / sum(rate(payments_processed_total[5m]))) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: 'Payment error rate above 5%'

      # Slow payments
      - alert: SlowPaymentProcessing
        expr: |
          histogram_quantile(0.99, 
            rate(payment_transaction_duration_seconds_bucket[5m])
          ) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'P99 payment latency above 2 seconds'

      # Outbox backlog
      - alert: OutboxBacklog
        expr: outbox_pending_events > 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'Outbox has {{ $value }} pending events'

      # Old unpublished events
      - alert: OldUnpublishedEvents
        expr: outbox_oldest_event_age_seconds > 300
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: 'Oldest event is {{ $value }}s old (>5min)'
```

---

## 🎨 Dashboard Guide

### **Creating Custom Panels**

1. Open Grafana → http://localhost:3001
2. Navigate to dashboard
3. Click "Add" → "Visualization"
4. Select data source (Prometheus, Jaeger, or Loki)
5. Enter query
6. Configure visualization type
7. Set thresholds and units
8. Click "Apply"

### **Best Practices**

- Use **Time series** for trends over time
- Use **Stat** for single values (success rate, total count)
- Use **Gauge** for saturation metrics (pending events, CPU %)
- Use **Heatmap** for latency distribution
- Set **thresholds** (Green/Yellow/Red) for quick status assessment
- Add **units** (seconds, percent, requests/sec) for clarity

---

## 🔧 Troubleshooting

### **No metrics in Prometheus**

```bash
# Check if collector is receiving data
docker logs payments-otel-collector | grep "ExportMetricsServiceRequest"

# Check if Prometheus is scraping
curl http://localhost:9090/api/v1/targets
```

### **No traces in Jaeger**

```bash
# Check if collector is forwarding traces
docker logs payments-otel-collector | grep "ExportTraceServiceRequest"

# Check Jaeger health
curl http://localhost:16686/api/services
```

### **Application not exporting telemetry**

**TypeScript:**

```bash
# Verify OTLP endpoint
echo $OTEL_EXPORTER_OTLP_ENDPOINT

# Check app logs
# Should see: "OpenTelemetry SDK initialized successfully"
```

**Go:**

```bash
# Verify environment
env | grep OTEL

# Check logs
# Should see: "Initializing OpenTelemetry SDK"
```

---

## 📚 Additional Resources

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Prometheus Query Examples](https://prometheus.io/docs/prometheus/latest/querying/examples/)
- [Jaeger Architecture](https://www.jaegertracing.io/docs/latest/architecture/)
- [Grafana Best Practices](https://grafana.com/docs/grafana/latest/best-practices/)
