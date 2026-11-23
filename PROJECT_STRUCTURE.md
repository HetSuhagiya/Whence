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
│       ├── explain_dialog_dark.png
│       ├── semantic_dimensions_light.png
│       └── semantic_dimensions_dark.png
├── backend/
│   ├── Dockerfile               # Python 3.12 production container
│   ├── pyproject.toml           # Strict Ruff, Mypy, and Pytest configuration
│   ├── requirements.txt         # Pinned backend dependencies
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py            # Pydantic v2 settings loaded from environment
│   │   ├── crypto.py            # AES-256-GCM encryption/decryption for credentials
│   │   ├── audit.py             # Query audit logger (sql, bytes, duration, whence label)
│   │   ├── db.py                # SQLite database initializer, connection sources, models, metrics, and versions storage
│   │   ├── demo_dataset.py      # Realistic synthetic ecommerce DuckDB generator (thelook_ecommerce schema)
│   │   ├── main.py              # FastAPI application & REST routes (/api/v1)
│   │   ├── adapters/            # Warehouse adapters behind unified interface
│   │   │   ├── __init__.py
│   │   │   ├── base.py          # WarehouseAdapter ABC, sqlglot guardrails (SELECT-only, byte cap, timeout, AST validation)
│   │   │   ├── duckdb_adapter.py# DuckDB adapter (local dev, demo mode, eval)
│   │   │   └── bigquery_adapter.py # Google BigQuery adapter (production target)
│   │   ├── connections/         # [Phase 1 - Item 1b] Warehouse connection management
│   │   │   ├── __init__.py
│   │   │   ├── models.py        # Connection schemas, error mapping, and check models
│   │   │   ├── service.py       # ConnectionService: key validation, encryption, 7 checks, zero-cost preview
│   │   │   └── router.py        # REST API endpoints (/api/v1/connections)
│   │   ├── semantic/            # [Phase 1 - Item 2] Semantic layer models & validation
│   │   │   ├── __init__.py
│   │   │   ├── models.py        # SemanticModel, Dimension, Metric, and MetricVersion schemas
│   │   │   ├── service.py       # SemanticService: CRUD, versioning, explanation toggle, formula validation, 30-day preview, default ecommerce seed
│   │   │   └── router.py        # REST API endpoints (/api/v1/semantic)
│   │   ├── compiler/            # [Phase 1 - Item 3] Query compiler for chart types
│   │   │   ├── __init__.py
│   │   │   ├── spec.py          # ChartSpec, ChartType, TimeGrain, and CompiledQuery schemas
│   │   │   ├── compiler.py      # QueryCompiler: multi-dialect SQL generator (DuckDB & BigQuery) with CTE ratio logic & identifier validation
│   │   │   └── router.py        # REST API endpoints (/api/v1/compiler)
│   │   ├── explain/             # [Phase 1 - Item 4] Standalone explain engine package (ZERO web/LLM imports)
│   │   │   ├── __init__.py      # Public exports
│   │   │   ├── models.py        # Pydantic models: Evidence, Finding, DriverContribution, NoiseCheckResult, SeasonalityResult
│   │   │   ├── interface.py     # Small warehouse-agnostic QueryRunner protocol
│   │   │   ├── contribution.py  # Section 8.3 maths: additive deltas, offsetting effects, exact two-point rate/mix split
│   │   │   ├── pipeline.py      # Section 8.2 typed pipeline functions (resolve, completeness, noise, seasonality, drivers, drill, dq, events, confidence, evidence)
│   │   │   └── engine.py        # ExplainEngine orchestrator
│   │   ├── narrative/           # [Phase 1 - Item 6] Verified narrative generation
│   │   │   ├── __init__.py
│   │   │   ├── client.py        # LLMClient protocol, daily token tracker, fake/gemini/openai providers
│   │   │   ├── checker.py       # NumberChecker: regex validation of numbers & segments vs Evidence
│   │   │   ├── fallback.py      # DeterministicFallbackGenerator: calibrated templates without LLM
│   │   │   ├── models.py        # NarrativeOutput and token usage logs
│   │   │   └── service.py       # NarrativeService: rendering, 1-retry feedback loop, verification
│   │   └── dashboards/          # [Phase 1 - Item 7] Dashboards and chart execution subsystem
│   │       ├── __init__.py
│   │       ├── models.py        # Dashboard and chart public/create schemas
│   │       ├── service.py       # DashboardService, dynamic 5 demo specs, session caching, SSE streaming
│   │       └── router.py        # REST routes (/api/v1/dashboards) and SSE streaming endpoint
│   ├── prompts/                 # [Phase 1 - Item 6] Versioned prompt templates
│   │   └── v1/
│   │       ├── narrative_system.txt # System prompt (style rules, plain prose, no hype)
│   │       └── narrative_user.txt   # User prompt (Evidence object injection, JSON schema)
│   └── tests/
│       ├── test_adapters.py     # Warehouse adapter tests (DuckDB live, BigQuery mock, sqlglot injection attempts, metric rules)
│       ├── test_api.py          # FastAPI endpoint integration tests
│       ├── test_connections.py  # [Item 1b] Key validation, 7 checks, error mapping
│       ├── test_crypto.py       # AES-256-GCM credential encryption tests
│       ├── test_semantic.py     # [Item 2] Semantic model CRUD, dimension toggle, metric versioning, formula validation, preview trend
│       ├── test_compiler.py     # [Item 3] Multi-dialect compiler, many-to-one joins (thelook schema), partition filter enforcement, dry-run bytes cap, golden SQL snapshots
│       ├── test_explain.py      # [Item 4] Step unit tests, hand-calculated rate/mix split, additive deltas, noise check, DQ scan
│       ├── test_explain_imports.py # [Item 4] AST test enforcing zero web/LLM imports in explain package
│       ├── test_narrative.py    # [Item 6] Number checker (figures & segments), fallback templates, fake provider, payload inspection, empty API key
│       └── test_dashboards.py   # [Item 7] 5 demo specs compilation, dashboard CRUD, SSE streaming explain pipeline
├── eval/                        # [Phase 1 - Item 5 & Step 5b] Standalone evaluation harness (Section 15)
│   ├── __init__.py
│   ├── scenarios.json           # Declarative definitions of all 12 planted scenarios + 7 blind scenarios (N1-N7)
│   ├── generator.py             # Synthetic ecommerce generator supporting reproducible random seeds
│   ├── baseline.py              # Naive baseline (ranks segments by absolute change in single highest-variance dimension)
│   ├── runner.py                # Evaluation runner comparing engine vs baseline across Dev & 5 fresh prime holdout seeds
│   ├── stats_utils.py           # Wilson score 95% confidence interval utility
│   ├── noise_sweep.py           # 200 noise seeds multiplicity sweep (Bonferroni evaluation)
│   ├── effect_size_sweep.py     # Effect size sweep (5%, 10%, 20%, 40% across scenarios 1, 2, 6; 240 runs)
│   ├── first_run_blind.py       # First-run blind evaluation runner (records raw engine responses before tuning)
│   ├── run_olist_real_data.py   # Live BigQuery Olist real-data evaluation (primeval-pixel-407210.dbt_project)
│   └── results/                 # Evaluation JSON artifacts (dated eval runs, blind results, Olist checks)
└── frontend/
    ├── Dockerfile               # Node.js Next.js container
    ├── package.json             # Frontend dependencies and scripts
    ├── tsconfig.json            # Strict TypeScript configuration
    ├── next.config.ts           # Next.js App Router configuration
    ├── postcss.config.mjs
    ├── vitest.config.ts         # Vitest testing configuration
    ├── eslint.config.mjs
    ├── scripts/
    │   ├── capture_screenshots.mjs # Automated Playwright light/dark capture
    │   └── capture_semantic.mjs    # Semantic layer light/dark capture
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
        │   │   └── page.tsx     # [Phase 1 - Item 1b/2] Warehouse connection & semantic layer tabs
        │   ├── dashboards/
        │   │   └── [id]/
        │   │       └── page.tsx # [Phase 1 - Item 7] Working dashboard page (5 dynamic charts, date controls, click-to-explain)
        │   └── dev/
        │       └── style/
        │           ├── page.tsx # Dev-only style guide route (404 in production)
        │           └── StyleGuideClient.tsx # Component gallery & palette showcase
        ├── components/
        │   ├── semantic/
        │   │   └── SemanticLayerManager.tsx # [Item 2] Dimensions, metrics, custom builder, preview, versioning
        │   ├── dashboard/       # [Phase 1 - Item 7] Dashboard components
        │   │   ├── ChartCard.tsx    # Card with metric subtitle, date badge, Chart.js rendering, hover explain, and view SQL modal
        │   │   ├── ExplainDialog.tsx# Centred modal with live SSE streaming checklist, waterfall chart, category drill, evidence tabs
        │   │   └── chartConfig.ts   # Chart.js registered controllers, grid colors, and responsive tooltips
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
        │   ├── api.ts           # Type-safe API client for connections, semantic layer, dashboards, and SSE explain stream
        │   └── utils.ts         # Class merging and formatting utilities
        └── tests/
            ├── setup.ts         # Vitest setup & DOM matchers
            ├── components.test.tsx      # Base UI component unit tests
            ├── connection_flow.test.tsx # [Item 1b] 3-step connection flow unit tests
            ├── loading_states.test.tsx  # [Item 1b] Button loaders, layout skeletons, aria-live, check states
            ├── semantic_ui.test.tsx     # [Item 2] Semantic layer UI tests (dimensions, metrics, preview)
            └── dashboard_ui.test.tsx    # [Item 7] Click-to-explain dashboard tests (cards, explain modal, SSE checklist)
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
- **`explain/`**:
  - `engine.py` & `pipeline.py`: Section 8.2 typed 10-step explanation pipeline (`resolve`, `completeness`, `noise` median/MAD, `seasonality`, `drivers`, `drill` two-way, `data_quality`, `events`, `confidence`, `evidence`).
  - `contribution.py`: Section 8.3 contribution maths (exact two-point rate/mix split, additive deltas with offsetting effects, low-support segment marking).
  - Enforces zero web or LLM imports (verified by AST test `test_explain_imports.py`).
- **`narrative/`**:
  - `client.py`: Provider-agnostic LLM client (Google Gemini REST, OpenAI-compatible / OpenRouter). Enforces daily token cap and disables redundant chain-of-thought reasoning tokens (`reasoning: {"max_tokens": 0}`) for sub-second responses.
  - `checker.py`: Strict post-generation `NumberChecker` verifying every figure (signed and absolute) and named segment exists in `Evidence` within tolerance before returning.
  - `fallback.py`: Deterministic fallback templates generating verified narrative without LLM on missing keys or validation failure.
- **`dashboards/`**:
  - `service.py`: Generates the 5 demo ecommerce charts from the semantic layer with dynamic warehouse compilation (DuckDB or BigQuery `thelook_ecommerce`), in-memory session caching, and SSE streaming pipeline (`stream_explain`).
  - `router.py`: REST routes (`/api/v1/dashboards`) for dashboard CRUD, chart execution (`/charts/{id}/run`), and Server-Sent Events explain stream (`/charts/{id}/explain`).

### 2.2 Frontend Modules (`frontend/src/`)

- **`app/globals.css`**:
  - Pure CSS variables mapped to `@radix-ui/colors` (Slate neutral scale 1-12, Blue accent scale, Green/Red trend indicators, Tableau 10 series colors, and dedicated `#59A14F` / `#E15759` waterfall colors).
  - Explicit font-family utility classes (`font-newsreader`, `font-instrument`, `font-jetbrains`) and tabular numerals (`tabular-nums`).
- **`app/page.tsx`**:
  - Real Dashboards home page listing saved dashboards with source badges, chart count, creation dates, and empty state with single CTA.
- **`app/dashboards/[id]/page.tsx`**:
  - Live dashboard page rendering the 5 dynamic chart cards in a responsive grid, real date filter controls, "View SQL" inspection dialog, and click-to-explain triggers.
- **`components/dashboard/`**:
  - `ChartCard.tsx`: Chart container rendering Chart.js canvas (line, bar, stacked bar, KPI tile, scatter), hover explain button, keyboard focus, and SQL preview modal.
  - `ExplainDialog.tsx`: Centred Radix Dialog with live SSE progress checklist, side-by-side comparison chart, interactive driver waterfall, breadcrumb drill-down, and Evidence/Data checks tabs.
  - `chartConfig.ts`: Chart.js global defaults, auto-scaling, tabular numerals, and responsive tooltips.
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
