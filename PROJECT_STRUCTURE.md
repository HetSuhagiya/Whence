# Whence — Project Structure & Codebase Map

> **Note for Contributors & Agents**: This document is the authoritative layout of the Whence codebase. It must be updated continuously whenever files, modules, endpoints, or directories are added, renamed, or modified.

---

## 1. Directory Tree Overview

```
Whence/
├── .env.example                 # Blueprint for environment variables
├── docker-compose.yml           # Multi-container orchestration (backend + frontend)
├── Makefile                     # Root development targets (install, test, lint, run)
├── package.json                 # Monorepo command orchestration
├── package-lock.json
├── README.md                    # Primary project overview, setup guide & CI status
├── PROGRESS.md                  # Authoritative continuous implementation progress ledger
├── PROJECT_STRUCTURE.md         # This file: authoritative codebase architecture map
├── agents/
│   └── build_doc.md             # Authoritative product brief and phase specification
├── docs/
│   └── screenshots/             # Visual verification captures (light & dark mode)
│       ├── dashboards_empty_light.png
│       ├── dashboards_empty_dark.png
│       ├── data_step1_connect_light.png
│       ├── data_step1_connect_dark.png
│       ├── data_step2_choose_data_light.png
│       ├── data_step2_choose_data_dark.png
│       ├── data_step3_test_passed_light.png
│       ├── data_step3_test_passed_dark.png
│       ├── data_step3_test_failure_light.png
│       ├── data_step3_test_failure_dark.png
│       ├── dev_style_light.png
│       ├── dev_style_dark.png
│       ├── explain_dialog_light.png
│       └── explain_dialog_dark.png
├── backend/
│   ├── Dockerfile               # Python 3.12 production container
│   ├── pyproject.toml           # Strict Ruff, Mypy, and Pytest configuration
│   ├── requirements.txt         # Pinned backend dependencies
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py            # Pydantic v2 settings loaded from environment
│   │   ├── crypto.py            # AES-256-GCM encryption/decryption for credentials
│   │   ├── audit.py             # Query audit logger (sql, bytes, duration, whence label)
│   │   ├── db.py                # SQLite database initializer and connection sources storage
│   │   ├── main.py              # FastAPI application & REST routes (/api/v1)
│   │   ├── adapters/            # Warehouse adapters behind unified interface
│   │   │   ├── __init__.py
│   │   │   ├── base.py          # WarehouseAdapter ABC, guardrails (SELECT-only, byte cap, timeout)
│   │   │   ├── duckdb_adapter.py# DuckDB adapter (local dev, demo mode, eval)
│   │   │   └── bigquery_adapter.py # Google BigQuery adapter (production target)
│   │   ├── connections/         # [Phase 1 - Item 1b] Warehouse connection management
│   │   │   ├── __init__.py
│   │   │   ├── models.py        # Connection schemas, error mapping, and check models
│   │   │   ├── service.py       # ConnectionService: key validation, encryption, 7 checks
│   │   │   └── router.py        # REST API endpoints (/api/v1/connections)
│   │   ├── semantic/            # [Phase 1 - Item 2] Semantic layer models & validation
│   │   ├── compiler/            # [Phase 1 - Item 3] Query compiler for chart types
│   │   ├── explain/             # [Phase 1 - Item 4] Standalone explain engine package
│   │   └── narrative/           # [Phase 1 - Item 6] LLM narrative & number check
│   └── tests/
│       ├── test_adapters.py     # Warehouse adapter tests (DuckDB live, BigQuery mock)
│       ├── test_api.py          # FastAPI endpoint integration tests
│       ├── test_connections.py  # [Item 1b] Key validation, 7 checks, error mapping. BigQuery verified live by user (23 Nov 2026); automated live test opt-in via WHENCE_LIVE_BQ_KEY_PATH
│       └── test_crypto.py       # AES-256-GCM credential encryption tests
├── eval/                        # [Phase 1 - Item 5] Standalone evaluation harness
│   ├── scenarios/               # 12 planted analytical cause scenarios
│   ├── dataset.py               # Synthetic ecommerce DuckDB generator
│   └── run.py                   # Evaluation runner and calibration metrics
└── frontend/
    ├── Dockerfile               # Node.js Next.js container
    ├── package.json             # Frontend dependencies and scripts
    ├── tsconfig.json            # Strict TypeScript configuration
    ├── next.config.ts           # Next.js App Router configuration
    ├── postcss.config.mjs
    ├── vitest.config.ts         # Vitest testing configuration
    ├── eslint.config.mjs
    ├── scripts/
    │   └── capture_screenshots.mjs # Automated Playwright light/dark capture
    ├── public/
    │   └── fonts/               # Self-hosted typography (Section 13)
    │       ├── newsreader-*.woff2    # Newsreader (wordmark & headings)
    │       ├── instrument-sans-*.woff2 # Instrument Sans (UI text)
    │       └── jetbrains-mono-*.woff2  # JetBrains Mono (SQL & code)
    └── src/
        ├── app/
        │   ├── globals.css      # Radix Slate & Blue tokens, CSS variables, typography
        │   ├── layout.tsx       # Root layout with font-face definitions
        │   ├── page.tsx         # Real home: Dashboards overview & clean empty state
        │   ├── data/
        │   │   └── page.tsx     # [Phase 1 - Item 1b] 3-step warehouse connection flow
        │   └── dev/
        │       └── style/
        │           ├── page.tsx # Dev-only style guide route (404 in production)
        │           └── StyleGuideClient.tsx # Component gallery & palette showcase
        ├── components/
        │   ├── ui/              # Accessible base UI primitives
        │   │   ├── button.tsx   # Radix blue11 fill (light) / blue9 (dark) primary button
        │   │   ├── input.tsx    # Accessible text/number input with error states
        │   │   ├── select.tsx   # Accessible dropdown select
        │   │   ├── tabs.tsx     # Radix tab navigation
        │   │   ├── dialog.tsx   # Centred accessible modal dialog
        │   │   ├── popover.tsx  # Popover floating surface
        │   │   ├── toast.tsx    # Toast notifications
        │   │   └── skeleton.tsx # Matching layout skeletons (no generic spinners)
        │   └── shell/
        │       └── AppShell.tsx # Left navigation rail (56px/220px) & top bar
        ├── lib/
        │   ├── api.ts           # Type-safe API client for connections and metadata
        │   └── utils.ts         # Class merging and formatting utilities
        └── tests/
            ├── setup.ts         # Vitest setup & DOM matchers
            ├── components.test.tsx      # Base UI component unit tests
            ├── connection_flow.test.tsx # [Item 1b] 3-step connection flow unit tests
            └── loading_states.test.tsx  # [Item 1b] Button loaders, layout skeletons, aria-live, check states
```

---

## 2. Module Responsibilities & Key Contracts

### 2.1 Backend Modules (`backend/app/`)

- **`config.py`**:
  - Pydantic Settings class parsing environment variables (`MAX_BYTES_SCANNED_PER_QUERY`, `QUERY_TIMEOUT_SECONDS`, `CREDENTIALS_MASTER_KEY`, `WHENCE_QUERY_LABEL`, `LLM_PROVIDER`, etc.).
  - Guarantees strict defaults (e.g. 10 GB scan cap, 60s timeout).
- **`crypto.py`**:
  - `CredentialCrypto` utility implementing authenticated AES-256-GCM encryption with random 12-byte nonces and prepended initialization vectors.
  - Validates 32-byte key lengths strictly; never exposes plain credentials.
- **`audit.py`**:
  - `QueryAuditLogger` recording structured `QueryAuditRecord` entries (unique ID, SQL string, dialect, duration in ms, bytes scanned, status, error, and `whence` job label).
- **`db.py`**:
  - SQLite schema initialization and connection provider (`connections` and `connection_sources` tables).
- **`connections/`**:
  - `models.py`: Pydantic models for connection creation, key updates, table details, preview responses, and 7-check verification items. Includes `map_bigquery_error` mapping GCP errors (403 missing roles, disabled API, 404, byte cap) to plain human-friendly fixes.
  - `service.py`: `ConnectionService` validating keys (< 64 KB, service account type, required fields), AES-256-GCM encryption at rest, BigQuery client management, project/dataset/table listing, 10-row zero-cost preview (`client.list_rows()`), and the 7-check live testing pipeline.
  - `router.py`: REST endpoints at `/api/v1/connections` for CRUD, testing, schema inspection, and sources saving.
- **`adapters/base.py`**:
  - Abstract base class `WarehouseAdapter` defining uniform `introspect()`, `dry_run()`, and `run()` signatures.
  - **Hardened SQL Guardrails with `sqlglot`**: Replaced regex check with dialect-aware AST parser (`sqlglot`). Enforces: exactly one statement, root is `exp.Select` (or `WITH ... SELECT`), prohibits DDL/DML anywhere in the AST (including inside CTEs), and blocks external functions reaching outside warehouse tables (`EXTERNAL_QUERY`, `ML.*`, `read_csv`, `read_parquet`, `httpfs`, etc.).
  - Exports `validate_metric_expression(expr, dialect)` for semantic layer metric formula validation in Item 2.
  - Enforces `MAX_BYTES_SCANNED_PER_QUERY` (10 GB default) and query execution timeouts.
- **`adapters/duckdb_adapter.py`**:
  - DuckDB implementation for local dev, demo mode, and the evaluation harness.
  - Introspects `information_schema.tables` and `information_schema.columns`; calculates dry run scan size; enforces execution timeout.
- **`adapters/bigquery_adapter.py`**:
  - BigQuery implementation using `google-cloud-bigquery`.
  - Integrates in-memory decryption of service-account JSON keys.
  - Applies `labels={"app": "whence"}` and `dry_run=True` to calculate `total_bytes_processed`.
  - Unit-tested and mock-tested (explicitly marked *not live-tested* until live credentials are provided).
- **`main.py`**:
  - FastAPI server serving health checks (`/api/v1/health`), adapter status, SQL query execution with guardrails, query audit logs, and settings endpoints.

### 2.2 Frontend Modules (`frontend/src/`)

- **`app/globals.css`**:
  - Pure CSS variables mapped to `@radix-ui/colors` (Slate neutral scale 1-12, Blue accent scale, Green/Red trend indicators, Tableau 10 series colors, and dedicated `#59A14F` / `#E15759` waterfall colors).
  - Explicit font-family utility classes (`font-newsreader`, `font-instrument`, `font-jetbrains`) and tabular numerals (`tabular-nums`).
- **`app/page.tsx`**:
  - Real Dashboards home page. When no dashboards exist, renders a clean one-sentence empty state: *"Connect a data source to build your first dashboard"* with a single button.
- **`app/dev/style/`**:
  - Developer-only design system showcase (`/dev/style`).
  - Gated server-side: returns 404 in production when `ENABLE_STYLE_GUIDE` is not set.
  - Confines all demo figures and test charts to this route.
- **`components/ui/`**:
  - Visual-identity-free Radix primitives: `Button`, `Input`, `Select`, `Tabs`, `Dialog`, `Popover`, `Toast`, `Skeleton`.
  - Solid buttons use `blue11` (light, 4.77:1 contrast) and `blue9` (dark, 5.78:1 contrast).
- **`components/shell/AppShell.tsx`**:
  - Collapsible navigation rail (56px collapsed, 220px expanded) with strictly 4 items: `Dashboards`, `Data`, `Events`, `Settings`.
  - Top bar with dashboard title, global filter indicators (`Last 30 days | All channels`), and light/dark theme switch.

---

## 3. Maintenance Rules for This File

1. **Whenever a file is added or removed**: Add or remove the corresponding entry in Section 1.
2. **Whenever a new subsystem is created**: Add a descriptive subsection in Section 2 outlining its responsibilities and API contract.
3. **Keep paths relative to repository root**: Use standard Unix-style forward slashes (`/`).
4. **Never let docs drift from code**: Run checks (`npm run test`, `npm run typecheck`, `npm run lint`) and verify this structure file matches `git status`.
