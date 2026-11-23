# Whence — Implementation Progress & Changelog

> **Authoritative Progress Ledger**: This document tracks the exact status of what has been implemented, verified, and delivered across all phases.
> **Maintenance Rule**: This file **must be updated continuously** at every step of progress, after every item, phase completion, or structural change, alongside `README.md` and `PROJECT_STRUCTURE.md`.

---

## 1. Executive Status Dashboard

- **Current Phase**: **Phase 1 — Prove the explanation**
- **Last Completed Milestone**: **Item 1b: Connect a warehouse (BigQuery) in the UI**
- **Next Milestone**: **Item 2: Semantic layer (models, dimensions, additive & ratio metrics, identifier validation)**
- **CI Test Health**:
  - BigQuery live connection: **Verified live by user (manual test, 23 Nov 2026)**; automated integration test remains opt-in via `WHENCE_LIVE_BQ_KEY_PATH`.
  - Backend (`pytest`): **23 passed, 1 skipped (opt-in live test)** (100% of non-skipped suite)
  - Frontend (`vitest`): **21 passed, 0 failed** (100% across base components, connection flow, and loading states)
  - TypeScript strict (`tsc --noEmit`): **0 errors**
  - Python strict (`mypy --strict`): **0 errors** across 17 source files
  - Code standards (`ruff` + `next lint`): **0 warnings, 0 errors**
  - Next.js Turbopack build (`next build`): **Succeeded** (`/`, `/data`, `/dev/style`)

---

## 2. Phase-by-Phase Implementation Ledger

### Phase 0 — Scaffold and Design System (Status: Completed & Approved)

| Deliverable / Requirement | Implementation Details | Verification / Tests |
| :--- | :--- | :--- |
| **Monorepo & CI Tooling** | `package.json`, `Makefile`, `docker-compose.yml`, `.env.example`, `.gitignore`. Unified scripts for test, typecheck, lint, format, build. | Verified via `npm run test`, `typecheck`, `lint`. |
| **Design Tokens & Palette (Section 13)** | CSS variables in `frontend/src/app/globals.css`. Radix `slate` (steps 1-12) for neutrals, Radix `blue` for accent (`blue11` light fill, `blue9` dark fill), Tableau 10 chart palette (`#4E79A7`...`#BAB0AC`), dedicated `#59A14F` and `#E15759` waterfall colors. | Measured WCAG AA contrast for all pairs in light/dark (all $\ge$ 4.5:1, up to 16.39:1). |
| **Typography** | Self-hosted fonts in `frontend/public/fonts/`: **Newsreader** (wordmark & headings), **Instrument Sans** (UI text), **JetBrains Mono** (SQL & code). Tabular numerals enabled. Strict scale: 12, 13, 14, 16, 20, 28, 36 px. | Verified rendering in dedicated font sample rows in `/dev/style`. |
| **Accessible Base UI Components** | Built in `frontend/src/components/ui/` with zero component-library branding: `Button`, `Input`, `Select`, `Tabs`, `Dialog`, `Popover`, `Toast`, `Skeleton`. | Vitest suite (`components.test.tsx`): 11 tests passing. |
| **App Shell & Navigation** | Narrow left rail in `AppShell.tsx` (56px collapsed, 220px expanded) with strictly 4 items: `Dashboards`, `Data`, `Events`, `Settings`. Top bar with global filters (`Last 30 days | All channels`) and theme switch. | Verified keyboard operability and responsive sheet behavior. |
| **Real Home (`/`)** | Dashboards home page in `frontend/src/app/page.tsx` with clean empty state: *"Connect a data source to build your first dashboard"* and single button. Zero build-status or scaffold text shown. | Captured screenshots in `docs/screenshots/dashboards_empty_*.png`. |
| **Dev-Only Style Guide (`/dev/style`)** | Server-side gated route (`NODE_ENV !== "production" || ENABLE_STYLE_GUIDE=true`), returns HTTP 404 in production when disabled. Confines all mock figures and fixtures. | Verified HTTP 404 / 200 response behavior. |
| **Centred Explain Modal Dialog** | Radix Dialog: width `min(960px, 92vw)`, max-height `85vh`, internal scroll, dimmed overlay, responsive full-screen sheet below 768px. Header, chart copy, driver waterfall, ranked list, drill-in breadcrumb, and tabs (Summary, Evidence, Data checks). | Captured screenshots in `docs/screenshots/explain_dialog_*.png`. |

---

### Phase 1 — Prove the Explanation (Status: In Progress)

#### Item 1: DuckDB and BigQuery Adapters & Hardened SQL Guardrails (Status: Completed)
- **Implementation**:
  - `backend/app/adapters/base.py`: `WarehouseAdapter` ABC.
  - **Hardened SQL Guardrails with `sqlglot`**: Replaced regex/light check with real dialect-aware parser (`sqlglot`). Strictly enforces:
    - Exactly ONE statement allowed (`len(statements) == 1`).
    - Root expression MUST be `exp.Select` (including `WITH ... SELECT`).
    - Prohibits DDL/DML anywhere in the AST (walks all nodes for `Insert`, `Update`, `Delete`, `Drop`, `Create`, `Alter`, `Command`, `Transaction`, `Commit`, `Rollback`, `LoadData`, `Export`, `Merge`).
    - Blocks CTE-wrapped mutations (e.g. `WITH deleted AS (DELETE FROM orders ...) SELECT ...`).
    - Blocks external functions and table escapes: BigQuery `EXTERNAL_QUERY`, `ML.*` (`ML.PREDICT`, `ML.GENERATE_TEXT`), and DuckDB file scans (`read_csv`, `read_parquet`, `read_json`, `httpfs`, `sqlite_scan`).
    - Exported `validate_metric_expression(expr, dialect)` for reuse in Item 2 (semantic layer).
  - **Byte Cap Guardrail**: Enforces `MAX_BYTES_SCANNED_PER_QUERY` (10 GB default). Queries exceeding cap fail safely on dry run: *"This query would scan X, above your Y limit. Narrow the date range or raise the limit in Settings."*
  - **Query Timeout**: Enforces `QUERY_TIMEOUT_SECONDS` (60s default) via `asyncio.wait_for` (`QueryTimeoutError`).
  - **Audit Logging**: Logs every execution with ID, SQL, dialect, duration, bytes scanned, and job label `whence`.
  - `backend/app/adapters/duckdb_adapter.py`: Introspects `information_schema.tables` and columns, dry runs via `EXPLAIN`, parameterised execution.
  - `backend/app/adapters/bigquery_adapter.py`: Production target using `google-cloud-bigquery`, decrypts service account credentials in-memory via AES-256-GCM, applies `labels={"app": "whence"}`, calculates bytes processed via dry run.
- **Verification**:
  - `backend/tests/test_adapters.py`: 11 tests passing covering introspection, dry runs, guardrail rejection, byte cap enforcement, timeouts, audit logs, BigQuery mock client tests, and exhaustive injection tests (stacked queries, comment tricks, quoted identifiers, case variations, CTE-wrapped DML, prohibited external functions).

#### Item 1b: Connect a Warehouse (BigQuery) in the UI & Polished Loading States (Status: Completed)
- **Implementation**:
  - **Backend Subsystem**:
    - `backend/app/db.py`: SQLite storage provider (`connections` and `connection_sources` tables).
    - `backend/app/connections/models.py`: Key validation (< 64 KB, service account type, required fields), AES-256-GCM encryption at rest, error mapping (403 missing roles, disabled API, 404, byte cap).
    - `backend/app/connections/service.py`: Service account credential handling, BigQuery metadata inspector, 10-row zero-cost preview via table-rows API (`client.list_rows()`), and the 7-check live testing pipeline:
      1. Key file format & service account fields
      2. Authentication check
      3. BigQuery Job User dry run (`SELECT 1`) in billing project
      4. List datasets permission
      5. Read table schema (BigQuery Data Viewer) on selected tables
      6. Dataset regional location detection
      7. Dry-run query on table vs. byte cap
    - `backend/app/connections/router.py`: REST endpoints at `/api/v1/connections` for CRUD, testing, schema inspection, sources saving, and key replacement (`PUT /{id}/key`).
    - `backend/app/main.py`: CORS configuration with `allow_origin_regex` to support any local origin/port interface.
  - **Frontend 3-Step Flow (`/data`) & Complete Loading States**:
    - `frontend/src/app/data/page.tsx`:
      - **Step 1: Connect**: Upload service-account JSON key (drag-and-drop, 64 KB check, helper text) or one-click *"Use demo data (DuckDB)"*. Saved connections management sidebar with Open, Replace Key dialog, and Delete.
      - **Step 2: Choose data**: Pick billing project, browse project (plus inline *"Add project by ID"* for `bigquery-public-data`), dataset (location badge), table multi-select, and table details inspector with **10-row zero-cost preview table** (`table-rows API • zero query cost`).
      - **Step 3: Test and save**: Live verification checklist showing all 7 checks with individual state indicators: `pending`, `running` (small spinner), `passed` (green check), `failed` (red alert with remediation).
      - **Loading State Mechanics**:
        - Button loading states (disabled, `aria-busy="true"`, inline spinner, width unchanged) on: upload key, test connection ("Re-run checks"), save connection, Add project by ID, Replace key, Remove connection.
        - Layout-matching Skeletons: table list (5 rows with checkbox/badge), table details (header, badges, schema table), and 10-row preview (tabular grid).
        - Debounce: waits under 200ms show no skeleton/spinner flicker; longer waits render layout skeletons.
        - Accessibility: Screen reader live announcements (`aria-live="polite"`), `prefers-reduced-motion` compliance.
    - `frontend/next.config.ts`: Internal reverse proxy rewrite (`/api/:path*` -> `http://127.0.0.1:8000/api/:path*`) avoiding CORS preflight rejections.
    - `frontend/src/lib/api.ts`: Type-safe API client for connection endpoints.
- **Verification**:
  - **Live Verification**: **BigQuery connection verified live by user (manual test, 23 Nov 2026)**. The automated live integration test remains opt-in via `WHENCE_LIVE_BQ_KEY_PATH`.
  - `backend/tests/test_connections.py`: 6 tests passing (key validation, DuckDB flow, key redaction/security, 7 checks mocked, error mappings) + 1 opt-in live test (`test_live_bigquery_connection_opt_in`) correctly skipped when `WHENCE_LIVE_BQ_KEY_PATH` is not set.
  - `frontend/src/tests/connection_flow.test.tsx`: 4 tests passing covering Step 1, 64 KB rejection, Step 2 preview, and Step 3 live checklist.
  - `frontend/src/tests/loading_states.test.tsx`: 6 tests passing verifying Button loading states (`aria-busy`, spinner, disabled), layout-matching skeletons, 200ms debounce, and 4-state check indicators (`pending`, `running`, `passed`, `failed`).
  - Playwright automated browser test verified key upload and immediate transition to Step 2.
  - Captured screenshots for light and dark modes across all steps in `docs/screenshots/` and artifact directory.

---

### Remaining Phase 1 Roadmap

| Item | Description | Status | Dependencies |
| :--- | :--- | :--- | :--- |
| **Item 2: Semantic layer** | Models, dimensions (categorical, time, numeric bucket), additive and ratio metrics (numerator, denominator, aggregations, formats), schema identifier validation, API & UI builder. | **NEXT** | Items 1, 1b |
| **Item 3: Query compiler** | Deterministic SQL compiler for chart types (line, bar, stacked bar, area, KPI tile with comparison, table, scatter) across DuckDB and BigQuery dialects. | Pending | Item 2 |
| **Item 4: Explain engine** | Standalone Python package (zero web dependencies). Pipeline (8.2): Resolve $\to$ Completeness $\to$ Size/noise (median/MAD) $\to$ Seasonality $\to$ Driver search $\to$ Greedy 2-way drill $\to$ Data quality scan $\to$ Events $\to$ Confidence $\to$ Evidence object. Contribution math (8.3): exact rate/mix split for ratios, delta contributions for additive metrics. Unit tests for each step. | Pending | Items 2, 3 |
| **Item 5: Evaluation harness** | DuckDB ecommerce dataset generator with 12 planted scenarios (category drop, state spike, discount AOV drop, tracking break to 0, mix shift without price change, price fall inside categories, overlapping causes, weekday dip control, partial day, noise control, low support segment, offsetting effects). Benchmarks: top-1/top-3 driver hit rates, false positive rates, calibration. Run via `npm run eval`. | Pending | Item 4 |
| **Item 6: Narrative step** | Provider-agnostic LLM client (`LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`). Number-check verifying all numbers against `Evidence` object with regex validation. Deterministic no-model fallback. | Pending | Item 4 |
| **Item 7: Demo dashboard** | 5-chart ecommerce dashboard (revenue over time, revenue by category, orders by state, AOV over time, orders by payment type) on ecommerce dataset. Click-to-explain on charts and data points opening centred Explain dialog populated by real engine output. | Pending | Items 1-6 |

---

## 3. Visual Artifacts Directory & Screenshots

All screenshots are stored in `docs/screenshots/` and the conversation artifact directory:

| View / State | Light Mode Screenshot | Dark Mode Screenshot |
| :--- | :--- | :--- |
| **Home (Dashboards empty state)** | `dashboards_empty_light.png` | `dashboards_empty_dark.png` |
| **Step 1: Connect a warehouse** | `data_step1_connect_light.png` | `data_step1_connect_dark.png` |
| **Step 2: Choose data & preview** | `data_step2_choose_data_light.png` | `data_step2_choose_data_dark.png` |
| **Step 3: Test connection (Passed)** | `data_step3_test_passed_light.png` | `data_step3_test_passed_dark.png` |
| **Step 3: Test connection (Failure with fix)**| `data_step3_test_failure_light.png`| `data_step3_test_failure_dark.png` |
| **Centred Explain Dialog** | `explain_dialog_light.png` | `explain_dialog_dark.png` |
| **Dev Style Guide (`/dev/style`)** | `dev_style_light.png` | `dev_style_dark.png` |

---

## 4. Continuous Maintenance Protocol

Whenever any code, test, or configuration is changed:
1. Update the **Executive Status Dashboard** in Section 1 (current item, test pass rates).
2. Update or add the relevant section under **Phase Implementation Ledger** in Section 2.
3. Update the **Visual Artifacts** table in Section 3 whenever new screens or states are captured.
4. Ensure cross-references in [README.md](README.md) and [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) remain synchronized.
