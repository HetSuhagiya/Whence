# Changelog

All notable changes to the Whence platform are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.1] - 2026-11-24

### Defect Fixes & Hardening (Olist BigQuery Connection & Dashboard Flow)

#### Fixed
- **BigQuery Location Hardening (Fix e)**: Resolved query job location mismatch by propagating the stored dataset location from connection sources through `ConnectionService` and `SemanticService` into `BigQueryAdapter(location=...)`. Query execution and dry-runs now target the exact regional cluster (e.g. `europe-west2`, `southamerica-east1`) without guessing or defaulting to `US`.
- **Type-Aware Date Filters & Model Anchor Date (Fix a)**: Eliminated the BigQuery date/timestamp mismatch error (`No matching signature for operator >= for argument types: DATE, TIMESTAMP`). Query compiler now evaluates relative window intervals in Python against the model's `anchor_date`, emitting typed parameters matching column type (`DATE`, `TIMESTAMP`, `DATETIME`) and avoiding SQL `CURRENT_*` functions. Added `POST /api/v1/semantic/models/{id}/refresh-anchor` to introspect `MAX(time_col)`, anchor-labeled presets, and custom date range filters.
- **Cardinality-Aware Dimension Auto-Suggestion (Fix c)**: Replaced naive type matching with cardinality heuristics evaluated over free table-rows samples ($\le 50$ distinct values). Measures (`items_revenue`, `freight_total`, `payment_total`) become additive candidate metrics (`SUM`), small integers are admitted as dimensions, and IDs & timestamps are strictly excluded from categorical breakdowns.
- **Deterministic Dashboard Planner (Fix b)**: Removed all hardcoded demo chart names (`category`, `state`, `traffic_source`). Implemented deterministic `DashboardPlanner` generating up to 5 dynamic charts based on model metrics and eligible categorical dimensions (metric over time, breakdowns by top dimensions, ratio metric over time, count by dimension). Unsupported charts are skipped cleanly with user-facing plain notes recorded in `dashboard.skipped_charts`.
- **Plain Error Presentation & Model Subtitles (Fix d)**: Added a top-level alert banner for dashboard issues, structured chart-level error cards with plain-language explanations and actionable fixes, and folded raw API details behind `<details><summary>Show technical details</summary>`. Metric titles are styled in sentence case and dashboard subtitles are derived from semantic model metadata without hardcoded "ecommerce analytics".
- **Parameterized Query Execution & DATE Truncation**: Extended `BigQueryAdapter` with `_to_bq_query_parameters` mapping Python parameters to `bigquery.ScalarQueryParameter`. Fixed temporal grouping for DATE columns in BigQuery to use `DATE_TRUNC(col, grain)` instead of `TIMESTAMP_TRUNC(col, grain, 'UTC')`.

#### Added
- **Alembic Database Migrations**: Formal database migration framework under `backend/alembic/` with migrations `0001_initial_schema`, `0002_add_model_anchor_date`, and `0003_add_dashboard_skipped_charts`.
- **Section 20 SDLC Standards**: Established binding Definition of Ready, Definition of Done, TDD regression cycles, and release gates in `docs/SDLC.md`.

---

## [0.1.0] - 2026-11-24

Initial baseline release establishing the engineering foundation, deterministic analysis engine, multi-dialect query compiler, warehouse adapters, evaluation harness, and click-to-explain dashboard interface across Phase 0 and Phase 1.

### Phase 0: Scaffold & Design System

#### Added
- **Monorepo Architecture & Tooling**: Configured unified root workspace orchestration for FastAPI backend and Next.js frontend with pinned lockfiles, `Makefile`, `docker-compose.yml`, typed `.env.example`, and comprehensive CI verification scripts.
- **Accessible Design System & Tokens**: Implemented complete CSS variables and color palettes conforming to WCAG AA contrast standards (minimum 4.5:1, up to 16.39:1). Uses Radix Slate for neutrals, Radix Blue for accents, Tableau 10 for charts, and dedicated `#59A14F` (up) and `#E15759` (down) waterfall hues.
- **Typography**: Self-hosted web fonts including Newsreader (wordmark & serif headings), Instrument Sans (clean UI text), and JetBrains Mono (SQL & code expressions) with tabular numerals enabled across a strict 12–36px scale.
- **Accessible UI Component Library**: Unbranded base components in `frontend/src/components/ui/` (`Button`, `Input`, `Select`, `Tabs`, `Dialog`, `Popover`, `Toast`, `Skeleton`) adhering to WAI-ARIA authoring practices.
- **App Shell & Responsive Navigation**: Collapsible 4-item navigation rail (`Dashboards`, `Data`, `Events`, `Settings`), top filter bar with global date/channel controls, and light/dark theme switcher.
- **Centred Explain Modal Dialog**: Responsive Radix Dialog (`min(960px, 92vw)`) with header, chart summary, driver waterfall, ranked drivers list, drill-in breadcrumbs, and detail tabs (`Summary`, `Evidence`, `Data checks`).
- **Gated Style Guide (`/dev/style`)**: Server-side gated development sandbox providing visual fixtures and token audits without leaking mock figures into production builds.

### Phase 1: Core Explain Engine, Compiler, Adapters, Narrative & UI

#### Added
- **Warehouse Adapters & Hardened SQL Guardrails**:
  - `WarehouseAdapter` protocol with DuckDB and Google Cloud BigQuery implementations.
  - AST-level SQL validation powered by `sqlglot`: strictly enforces single `SELECT` statements, prohibits all DDL/DML (including CTE-wrapped modifications), and blocks external function escapes (`EXTERNAL_QUERY`, `ML.*`, `read_csv`, etc.).
  - Query byte cap enforcement (`MAX_BYTES_SCANNED_PER_QUERY`, 10 GB default) via dry-run estimation and query timeout enforcement (`QUERY_TIMEOUT_SECONDS`, 60s default).
  - Structured execution audit logger recording query durations, bytes scanned, and job labels.
- **Warehouse Connection Subsystem (`/data`)**:
  - Encrypted credential storage at rest using AES-256-GCM.
  - Automated 7-step live BigQuery permission validation checklist (key format, authentication, job user dry-run, list datasets, read table schema, regional location detection, byte cap check).
  - Table schema inspector with 10-row zero-query-cost preview via BigQuery tabledata API.
  - Polished 3-step UI wizard (`Connect`, `Choose data`, `Test & save`) with layout-matching skeletons, 200ms debounce, and screen reader announcements.
- **Semantic Layer Manager**:
  - Persistent SQLite storage for models, dimensions, metrics, and metric versions.
  - Formula validation via AST parsing ensuring single-level aggregation and function allowlists.
  - Metric versioning tracking mathematical definition changes for auditability.
  - Explanability controls: interactive `exclude_from_explanation` toggles for high-cardinality identifiers.
  - Adaptive 1-click default ecommerce seeding and realistic 12-month synthetic ecommerce DuckDB dataset generator.
- **Multi-Dialect Query Compiler**:
  - Deterministic SQL compiler translating declarative `ChartSpec` objects into native DuckDB and BigQuery SQL.
  - Safe ratio metric compilation using CTEs and dialect-aware zero-division protection (`SAFE_DIVIDE` on BigQuery, `NULLIF` on DuckDB).
  - Support for many-to-one dimension joins (`thelook_ecommerce` schema) with zero row multiplication.
  - Golden SQL snapshot regression testing across all 7 chart types.
- **Deterministic Explain Engine**:
  - Standalone package in `backend/app/explain/` with strictly zero web framework and zero LLM dependencies.
  - Hand-calculated exact rate/mix decomposition ($R_1 - R_0 \equiv \sum \text{Rate}_i + \sum \text{Mix}_i$) for ratio metrics and delta contribution for additive metrics.
  - 10-step analytical pipeline: window alignment, completeness checking, median/MAD noise filtering, seasonality checks, driver ranking, greedy two-way drilldowns, data quality irregularity scans (zero drops, duplicate jumps, null spikes), business event correlation, deterministic confidence tier calculation (High, Medium, Low), and structured `Evidence` assembly.
- **Rigorous Evaluation Harness (`npm run eval`)**:
  - Reproducible benchmark across 12 planted and 7 blind analytical scenarios evaluated with synthetic generators and holdout prime seeds.
  - Top-1 cause driver accuracy of 100.0% on both development and fresh holdout sets (versus 40.7% naive baseline).
  - Zero false alarms on control scenarios and 100.0% accuracy on High-confidence determinations.
  - Multiplicity sweep with Bonferroni correction and effect-size sensitivity thresholds.
  - Real-data validation on live Olist BigQuery dataset without prior engine tuning.
- **Narrative Generation & Verification**:
  - Provider-agnostic LLM client (OpenRouter, Gemini, OpenAI) with configurable daily token budgets and zero raw rows in prompt payloads.
  - `NumberChecker` post-generation verifier validating that every number, percentage, count, and entity in the narrative strictly exists in the engine's `Evidence` object.
  - Instant deterministic fallback generator for offline mode, exhausted token limits, low confidence, or validation failures.
  - Latency optimization suppressing hidden reasoning tokens for sub-2-second streaming responses.
- **Click-to-Explain Dashboards UI**:
  - Responsive dashboards supporting line, bar, and breakdown charts with real-time SSE streaming explain progress updates.
  - Interactive driver waterfall visualizations with drill-in breadcrumbs.
  - SQL query inspector modal with one-click copy and accessible data table views.
- **Database Migrations & SDLC Integration**:
  - Formal SDLC process document extracted in `docs/SDLC.md`.
  - Architecture Decision Record `docs/adr/0001-database-migrations.md` adopting Alembic for versioned database migrations.
  - Baseline migration `backend/alembic/versions/0001_initial_schema.py` capturing all 8 core metadata tables with SQLite batch mode support.
  - Programmatic migration runner executing automatically on application initialization.
