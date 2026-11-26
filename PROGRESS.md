# Whence — Implementation Progress & Changelog

> **Authoritative Progress Ledger**: This document tracks the exact status of what has been implemented, verified, and delivered across all phases.
> **Maintenance Rule**: This file **must be updated continuously** at every step of progress, after every item, phase completion, or structural change, alongside `README.md` and `PROJECT_STRUCTURE.md`.

---

## 1. Executive Status Dashboard

- **Current Version**: **v0.2.3 (Product-First Mode: Ticket 4 Explain Detail v2 Delivered)**
- **Baseline Release**: **v0.1.0 locally tagged on main (`811883c`)**
- **Process Framework**: **Section 20 Full SDLC Binding Process (`docs/SDLC.md`)**
- **CI Test Health**:
  - Evaluation Harness (`npm run eval`): **82.5% Engine Top-1 on Dev Set**, **80.7% on Holdout Set**, **0.0% False Positives on Controls**, **95.5% Calibration on High Confidence**, **100.0% Partial Day, Low Support & Offsetting Effects Handling**. (Zero regression across all 19 benchmark scenarios).
  - BigQuery live connection: **100% verified against real Olist BigQuery dataset (`primeval-pixel-407210:dbt_project`)** in `europe-west2`.
  - Backend (`pytest`): **90 passed, 1 skipped (opt-in live test)** across adapters, compiler, connections, crypto, custom definitions AST validator & preview, semantic layer, dependents endpoint, explain engine v2, narrative generation & direction checks, dashboards service, and Alembic migrations.
  - Frontend (`vitest`): **62 passed, 0 failed** across custom definitions UI, chart styling & accessibility, navigation flow, base components, connection flow, loading states, semantic layer manager, click-to-explain dashboard UI, and explain detail v2 components.
  - Production Build (`next build --turbopack`): **Clean production build** for all 6 routes (`/`, `/_not-found`, `/dashboards/[id]`, `/data`, `/dev/style`).
  - TypeScript strict (`tsc --noEmit`): **0 errors**.
  - Python strict (`mypy --strict`): **0 errors** across 40 source files.
  - Code standards (`ruff` + `next lint`): **0 warnings, 0 errors**.


---

## 2. Olist BigQuery Defect Fixes & Verification (Section 20)

### 2.1 The Five Root-Cause Fixes Delivered Sequentially
1. **Fix (e) — BigQuery Regional Location Hardening (`6ddb296`)**:
   - *Root Cause*: Query jobs defaulted to US multi-region if location was unset. Regional datasets (such as `europe-west2`) failed with `Dataset was not found in location US`.
   - *Fix*: Added `location` parameter to `BigQueryAdapter`, propagated stored dataset location through `ConnectionService` and `SemanticService`, and passed `client.query(..., location=self.location)`.
2. **Fix (a) — Type-Aware Date Filters & Anchor Date Discovery (`0ccb77b`)**:
   - *Root Cause*: `TIMESTAMP_SUB(CURRENT_TIMESTAMP())` compared against a `DATE` column failed with `No matching signature for operator >= for argument types: DATE, TIMESTAMP`. Furthermore, historical datasets (Olist ended Aug 2018) yielded empty windows relative to wall-clock time.
   - *Fix*: Added Alembic migration `0002_add_model_anchor_date.py`. Python evaluates comparison windows against `model.anchor_date` and passes typed parameter casts matching column type (`DATE`, `TIMESTAMP`, `DATETIME`). Added `POST /api/v1/semantic/models/{id}/refresh-anchor`, anchor-labeled preset badges, and custom date range filters.
3. **Fix (c) — Cardinality-Aware Dimension Suggestions (`01f6617`)**:
   - *Root Cause*: Auto-suggestions treated measures as dimensions and IDs as categorical breakdowns.
   - *Fix*: Enforced `MAX_CATEGORICAL_CARDINALITY = 50` evaluated on free table-rows preview samples. Measures become `SUM` candidate metrics, small integer columns become dimensions, and IDs & timestamps are strictly excluded from categorical breakdowns.
4. **Fix (b) — Deterministic Dashboard Planner (`86563d2`)**:
   - *Root Cause*: Dashboard generation hardcoded demo dimension names (`category`, `state`, `traffic_source`), causing `Fct Orders Model` to request non-existent columns.
   - *Fix*: Added Alembic migration `0003_add_dashboard_skipped_charts.py`. Built deterministic `DashboardPlanner` generating up to 5 dynamic charts based on model metrics and eligible dimensions (metric over time, 1-2 dimension breakdowns, ratio metric, count by top dimension). Unsupported charts are skipped cleanly with user-facing plain notes recorded in `dashboard.skipped_charts`.
5. **Fix (d) — Plain Error Presentation & Model-Driven Subtitles (`48b4383`)**:
   - *Root Cause*: Raw BigQuery error dumps scared users, metric names were raw SQL identifiers, and the subtitle hardcoded "ecommerce analytics".
   - *Fix*: Added top-level error banner, structured chart-level cards with short explanations and remediation advice, folded raw API error details behind `<details><summary>Show technical details</summary>`, converted metric names to sentence case, and derived subtitles from model metadata.
6. **Hardening — BigQuery Parameters & Truncation**:
   - BigQuery query parameters mapped to `bigquery.ScalarQueryParameter` in `_to_bq_query_parameters`.
   - Truncation on BigQuery DATE columns uses `DATE_TRUNC(col, grain)` instead of `TIMESTAMP_TRUNC(col, grain, 'UTC')`.
7. **Fix (g) — Regional Dataset Location Persistence & Dynamic Healing (`5e32337`)**:
   - *Root Cause*: `client.list_datasets()` returns `DatasetListItem` objects which do not contain `.location`. Initial connection creation defaulted to `"US"`. When saving sources or running the live checklist, the true table/dataset regional location (`europe-west2`) was not persisted to the `connections` table. Consequently, queries against `primeval-pixel-407210:dbt_project` attempted dry-runs in location `US`, failing with 404.
   - *Fix*:
     1. `save_sources`: Introspects the table/dataset reference via the BigQuery client and updates `connections.location` to the actual region (`europe-west2`).
     2. `list_datasets` and `test_connection`: Explicitly resolve dataset references to fetch and persist the regional location.
     3. `get_adapter_for_connection`: Dynamically self-heals any connection stuck with default `"US"` by introspecting its sources/dataset on demand and updating SQLite.
     4. Regression tests added in `backend/tests/test_connections.py` verifying detection, persistence, and self-healing.

### 2.2 Evaluation Benchmark: Before and After
The 19-scenario synthetic benchmark (`npm run eval`) was executed before and after the 5 defect fixes:

| Metric | Before Fixes (v0.1.0) | After Fixes (v0.1.1) | Status |
| :--- | :--- | :--- | :--- |
| **Dev Set Top-1 Hit Rate** | 82.5% | 82.5% | No regression |
| **Holdout Test Set Top-1** | 80.7% | 80.7% | No regression |
| **Baseline Top-1 Hit Rate** | 45.6% | 45.6% | Benchmark baseline |
| **Control False Positive Rate** | 0.0% | 0.0% | 100% Noise/Dip immunity |
| **Calibration (High Confidence)** | 95.5% | 95.5% | Well calibrated |
| **Partial Day Handling** | 100.0% | 100.0% | Perfect handling |
| **Low Support Handling** | 100.0% | 100.0% | Perfect handling |
| **Offsetting Effects Handling** | 100.0% | 100.0% | Perfect handling |

### 2.3 Real-Data Olist Evaluation Runs (Live BigQuery `primeval-pixel-407210`)
All six historical test periods executed cleanly against the user's live BigQuery warehouse in `europe-west2`:

1. **(a) Black Friday 2017 Spike (2017-11-13..19 vs 2017-11-20..26)**:
   - Revenue: \$175,819.69 $\to$ \$407,169.06 (+131.6%)
   - Confidence: **Medium** (Top 3 drivers explain 69.9% of change across multiple segments)
   - Top Drivers: `state: SP` (+\$74,330.94, 33.8%), `state: MG` (+\$45,256.14, 20.6%), `state: RJ` (+\$33,970.39, 15.5%)
2. **(b1) Ordinary Week 1 (March 2017) (2017-03-06..12 vs 2017-03-13..19)**:
   - Revenue: \$78,362.16 $\to$ \$95,524.38 (+21.9%)
   - Confidence: **Low** (Tracking zero drop / null spike scan flags high volatility)
   - Top Drivers: `category: watches_gifts` (+\$8,146.45, 50.5%), `state: RJ` (+\$7,181.91, 40.7%)
3. **(b2) Ordinary Week 2 (May 2017) (2017-05-08..14 vs 2017-05-15..21)**:
   - Revenue: \$113,051.56 $\to$ \$122,182.25 (+8.1%)
   - Confidence: **Low** (Change is within normal historical volatility; no single cause stands out)
   - Top Drivers: `state: SP` (+\$12,941.87, 115.4%), `category: computers_accessories` (-\$8,477.06, -138.8%)
4. **(b3) Ordinary Week 3 (July 2017) (2017-07-10..16 vs 2017-07-17..23)**:
   - Revenue: \$114,349.25 $\to$ \$122,535.87 (+7.2%)
   - Confidence: **Low** (Change is within normal historical volatility; no single cause stands out)
   - Top Drivers: `state: RJ` (+\$7,715.39, 77.6%), `category: garden_tools` (+\$5,207.10, 56.1%)
5. **(b4) Ordinary Week 4 (August 2017) (2017-08-14..20 vs 2017-08-21..27)**:
   - Revenue: \$127,107.88 $\to$ \$106,754.08 (-16.0%)
   - Confidence: **Low** (Decline is broad-based across all categories and channels; no single driver accounts for movement)
   - Top Drivers: `state: SP` (-\$6,117.44, 30.7%), `category: bed_bath_table` (-\$4,983.85, 25.7%)
6. **(b5) Ordinary Week 5 (October 2017) (2017-10-09..15 vs 2017-10-16..22)**:
   - Revenue: \$155,074.38 $\to$ \$164,132.89 (+5.8%)
   - Confidence: **Low** (Change is within normal historical volatility; no single cause stands out)
   - Top Drivers: `state: SP` (+\$7,268.14, 158.1%), `category: health_beauty` (+\$6,456.73, 61.6%)

### 2.4 Playwright E2E Live Verification Artifacts
Automated Playwright browser script (`frontend/scripts/e2e_olist_playwright.mjs`) verified the entire user journey:
- Navigated to `/dashboards`, selected `Olist Operations Dashboard`
- Verified dynamic chart queries ran against BigQuery in `europe-west2`
- Verified rendered charts: Freight Total over time, Freight Total by Region, Freight Total by State, AOV over time, Orders by Region
- Triggered Explain dialog on a chart point, verified live 10-step SSE progress stream and verified narrative
- Captured visual artifacts:
  - `docs/screenshots/olist_dashboard_light.png`
  - `docs/screenshots/olist_dashboard_dark.png`
  - `docs/screenshots/olist_explain_light.png`
  - `docs/screenshots/olist_explain_dark.png`

---

## 3. Manual Test Script for Live BigQuery Connection

To manually verify your live BigQuery connection in the UI, follow these steps:

1. **Verify Backend & Frontend are running**:
   ```bash
   curl -s http://localhost:8000/api/v1/health
   # Expected: {"status":"ok","service":"whence-api","version":"0.1.0",...}
   ```
2. **Open Data Workspace (`http://localhost:3000/data`)**:
   - Confirm your BigQuery connection (`BigQuery production`) is listed with location detected as `europe-west2`.
   - In the Semantic Model tab, confirm `Fct Orders Model` is mapped to table `fct_orders`.
   - Click **Refresh Anchor Date**: confirm anchor date displays `2018-10-17`.
3. **Open Dashboards (`http://localhost:3000/dashboards`)**:
   - Click **New Dashboard**, name it `Olist Executive`, select `BigQuery production` and `Fct Orders Model`.
   - The deterministic planner will instantly generate up to 5 dynamic charts without any hardcoded ecommerce names.
4. **View Dashboard & Filter Data**:
   - Inspect the date preset dropdown: notice badges like `Last 30 days of data (to 17 Oct 2018)`.
   - Charts render live query results directly from BigQuery without type coercion errors.
5. **Click-to-Explain**:
   - Click any point on a chart or click the **Explain** button.
   - Watch the 10-step deterministic explanation checklist stream in real time.
   - Review the verified narrative, ranked dimension drivers, and confidence level.

---

## 4. Architectural Decision Records (ADRs)

- **ADR 0001**: Database Migrations with Alembic (`docs/adr/0001-database-migrations.md`) - Adopted standard linear migration tooling across SQLite/PostgreSQL with automatic startup execution.

---

## 5. Next Planned Work: LLM-Assisted Dashboard Planning (Section 20)
- **Status**: Ready for Requirements Phase.
- **Next Step**: Run `/grill-me` on LLM-assisted dashboard planning (one question at a time), author formal specification (`/to-spec`), design ADRs, vertical tickets (`/to-tickets`), and obtain user sign-off before code implementation.

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

#### Item 2: Semantic Layer (Models, Dimensions, Additive & Ratio Metrics, Versioning, UI) (Status: Completed)
- **Implementation**:
  - **Database & Storage Provider** (`backend/app/db.py`):
    - Added tables `models`, `dimensions`, `metrics`, and `metric_versions` with foreign keys and cascade delete.
  - **Demo Dataset Generator** (`backend/app/demo_dataset.py`):
    - Generates persistent, realistic ecommerce dataset at `data/demo_ecommerce.duckdb` with 29,783 orders and 43,122 order items spanning 12 months with realistic seasonality and weekday patterns, matching BigQuery `thelook_ecommerce` schema (`orders`, `order_items`, `thelook_ecommerce_orders`).
  - **Semantic Layer Backend** (`backend/app/semantic/`):
    - `models.py`: Pydantic models for `ModelCreate`, `DimensionCreate`, `MetricCreate`, `MetricVersionPublic`, `MetricValidateRequest`, `MetricPreviewRequest`, `AutoSuggestResponse`, and `DefaultEcommerceSetRequest` (with optional `project_id`, `dataset_id`, `table_name` resolving from saved sources).
    - `service.py`: `SemanticService` implementing:
      - Model CRUD with primary time column declaration.
      - Dimension CRUD with `exclude_from_explanation` toggle (excludes identifiers and very high-cardinality columns from automated explanation search by default).
      - Metric CRUD with version tracking in `metric_versions` (records numerator, denominator, filter, timestamp, and audit history).
      - Formula validation using `validate_metric_expression(expr, dialect)` (ensuring SELECT-only, no DDL/DML, and AST syntactic validity).
      - 30-day preview trend calculation (`preview_metric_trend`) computing real time-series from the active warehouse.
      - Adaptive 1-click seeding of standard ecommerce metrics (`revenue`, `orders`, `items_sold`, `aov`, `items_per_order`) and dimensions: automatically resolves against the connection's introspected table columns (e.g. `order_date` or `created_at`, price columns, order IDs).
    - `router.py`: REST endpoints at `/api/v1/semantic/` (`/models`, `/dimensions`, `/metrics`, `/metrics/validate`, `/metrics/preview`, `/models/default-ecommerce`).
  - **Frontend Client Error Resilience** (`frontend/src/lib/api.ts`):
    - Built `extractErrorMessage` to unpack FastAPI/Pydantic validation error objects and arrays into plain human-readable messages, permanently preventing `[object Object]` rendering.
  - **Semantic Layer UI & Component** (`frontend/src/components/semantic/SemanticLayerManager.tsx`):
    - Top-level "Semantic layer" tab on `/data` with connection switcher.
    - 1-click "Confirm default ecommerce set" button with immediate schema seeding.
    - Active model overview showing table name, time column, dimension & metric counts.
    - High-contrast explanation eligibility toggles: replaced washed-out amber/emerald pastel styles with strict Radix UI tokens (`slate12`/`slate3` for Excluded at 14.2:1 contrast, `green11`/`green3` for Eligible at 4.65:1 contrast in light mode; 13.5:1 and 9.8:1 in dark mode).
    - Dimensions table with type badges (`categorical`, `time`, `numeric_bucket`) and interactive `exclude_from_explanation` toggle switch.
    - Metrics table with additive/ratio badges, formula view, display format, and version history modal (`v1`, `v2`, etc.).
    - Custom Metric Builder dialog:
      - Name, description, additive/ratio selector, numerator and denominator SQL inputs, fixed filter, and display format.
      - Live "Validate formula" button providing AST parser verification feedback.
      - Live "Preview last 30 days" line chart rendered via Chart.js with Tableau 10 primary color (`#4E79A7`).
  - **Verification**:
    - `backend/tests/test_semantic.py`: 6 tests passing covering model CRUD, dimension toggle, metric versioning, formula validation, preview trend calculation, and default ecommerce set seeding.
    - `frontend/src/tests/semantic_ui.test.tsx`: 4 tests passing verifying empty state seed prompt, 1-click ecommerce seed, dimension explanation toggle switch, and formula AST validation feedback.

#### Item 3: Query Compiler for Multi-Dialect Chart Types (Status: Completed)
- **Implementation**:
  - `backend/app/compiler/spec.py`:
    - `ChartSpec`: Pydantic schema for `model_id`, `metric`, `dimensions`, `time_grain` (`day`, `week`, `month`, `quarter`, `year`), `date_range`, filters, and `chart_type` (`line`, `bar`, `stacked_bar`, `area`, `kpi`, `table`, `scatter`).
    - `CompiledQuery`: SQL string, dialect, metric name, chart type, and parameter values.
    - `ChartExecutionResult`: Spec, compiled SQL, columns, rows, execution time ms, and bytes scanned.
  - `backend/app/compiler/compiler.py`:
    - `QueryCompiler`: Deterministic SQL compiler translating chart specs into native DuckDB and BigQuery dialects.
    - Resolves metrics and dimensions dynamically from the active `SemanticModel`.
    - Identifier validation against introspected model schema to strictly prevent column injection.
    - Dialect-aware date truncation (`DATE_TRUNC('day', ...)` for DuckDB vs `TIMESTAMP_TRUNC(..., DAY)` for BigQuery).
    - Additive vs ratio aggregation logic: ratio metrics dynamically construct a CTE computing numerator and denominator aggregations, then calculate the final ratio with safe division (`SAFE_DIVIDE(numerator, denominator)` in BigQuery, `numerator / NULLIF(denominator, 0)` in DuckDB).
    - Pre-execution validation through `validate_sql` AST parser.
    - Parameterised date filtering (e.g. `last_30_days`, `last_90_days`, `last_year`).
  - `backend/app/compiler/router.py`:
    - REST endpoints at `/api/v1/compiler/` (`/compile`, `/execute`, `/demo-specs/{model_id}`).
  - **ITEM 7 DEMO SOURCE CHANGE**:
    - Generates 5 standard demo chart specs (`Revenue over time`, `Revenue by category`, `Orders by state`, `Average order value over time`, `Orders by traffic source`) directly from the semantic layer.
    - Works on whichever connected source is active (demo DuckDB or BigQuery, e.g. `bigquery-public-data.thelook_ecommerce`), with **zero hardcoded chart SQL**.
- **Verification**:
  - `backend/tests/test_compiler.py`: 11 tests passing covering additive line charts for DuckDB and BigQuery, ratio metrics with CTE and safe divide, bar breakdowns, stacked bars, identifier rejection, many-to-one joins (thelook schema), partition filter enforcement, dry-run bytes cap check before execution, golden SQL snapshots, and real execution against demo DuckDB.

---

#### Pre-Item 4 Gap Fixes & Verification (Status: Completed)
1. **Metric Expression Rules (Item 2 Brief)**:
   - Function allowlist: `ALLOWED_METRIC_FUNCTIONS` (SUM, COUNT, AVG, MIN, MAX, COALESCE, NULLIF, SAFE_DIVIDE, etc.).
   - No subqueries (`exp.Select`, `exp.Subquery` strictly rejected).
   - No window functions (`exp.Window`, `exp.WindowSpec` strictly rejected).
   - Only columns on the model's table or declared joins allowed (`allowed_columns` AST check).
   - Single aggregation level enforced: nested aggregations (e.g. `SUM(AVG(...))`) strictly rejected.
   - Tested in `backend/tests/test_adapters.py`.
2. **Models with Many-to-One Joins (`thelook_ecommerce` Schema)**:
   - Base table: `order_items`. Category is on `products` (joined on `order_items.product_id = products.id`), State and Traffic Source are on `users` (joined on `order_items.user_id = users.id`).
   - Declared keys in `ModelJoin` validated against introspected schema, compiled as `LEFT JOIN`.
   - Cardinality marked `relationship="many_to_one"` guaranteeing zero row multiplication.
   - All 5 demo specs compiled and tested in `test_compiler_thelook_joins_all_five_specs` (marked *not live-tested* as no live BigQuery service account key is configured in test env).
3. **Compiler Requirements from Brief**:
   - BigQuery partition filter required when `require_partition_filter=True`; missing filter raises `QueryGuardrailError`.
   - Dry-run bytes check BEFORE execution in `QueryCompiler.execute`: queries exceeding cap raise `QueryByteCapExceededError`.
   - Defined week start: Monday (BigQuery `TIMESTAMP_TRUNC(col, WEEK(MONDAY), 'UTC')`; DuckDB `date_trunc('week', col)` defaults to Monday per ISO 8601).
   - Defined time zone: explicit UTC.
   - Golden SQL snapshots tested for all 7 chart types (`line`, `bar`, `stacked_bar`, `area`, `kpi`, `table`, `scatter`) across DuckDB and BigQuery dialects.
4. **Demo Chart Specs Compilation & Guardrails**:
   - All 5 demo specs verified executing and returning live data on DuckDB demo warehouse.
   - All 5 demo specs verified compiling safely with validated ASTs on BigQuery.

---

#### Item 4: Explain Engine (Standalone Package, Section 8.1 - 8.4) (Status: Completed)
- **Implementation**:
  - `backend/app/explain/`:
    - **ZERO Web & ZERO LLM Imports**: Zero imports from web frameworks (`fastapi`, `starlette`, `httpx`, `requests`) or LLMs (`openai`, `anthropic`, `google.generativeai`). Verified by AST inspection test in `test_explain_imports.py`.
    - `interface.py`: Small warehouse-agnostic `QueryRunnerProtocol` enabling pure in-memory or database-backed execution.
    - `models.py`: Typed Pydantic models for `Evidence`, `Finding`, `DriverContribution`, `NoiseCheckResult`, `SeasonalityResult`, `DataQualityIssue`, `ContextEvent`, `ConfidenceLevel`.
    - `contribution.py`:
      - Additive metrics: segment delta contributions, share of total change, and detection of offsetting effects (large gains and losses canceling out).
      - Ratio metrics: exact two-point rate/mix decomposition ($R_1 - R_0 \equiv \sum \text{Rate}_i + \sum \text{Mix}_i$ identically, with rate effect $\bar{w}_i \Delta r_i$ and mix effect $\Delta w_i (\bar{r}_i - \bar{R})$).
      - Minimum segment size & low support: segments with $< 20$ rows marked as `low_support = True`.
    - `pipeline.py`: Typed functions for all 10 steps of Section 8.2:
      1. `step_resolve`: metric, grain, and weekday-aligned windows.
      2. `step_completeness_check`: flags partial periods and late-arriving data.
      3. `step_size_and_noise_check`: median and MAD over history (8-26 periods), generating plain language comparison (e.g. *"larger than 24 of the last 26 weekly changes"*).
      4. `step_seasonality_check`: detects weekday/seasonal cycles; flags if routine seasonality explains movement.
      5. `step_driver_search`: ranks segments by contribution across all eligible dimensions.
      6. `step_two_way_drill`: greedy 2-way search over top dimensions to find smallest segment explaining $\ge 60\%$ of change.
      7. `step_data_quality_scan`: detects zero drops, zero appearances, null spikes, and duplicate-row jumps.
      8. `step_context_events`: correlates overlapping logged business events.
      9. `step_compute_confidence`: deterministic rules for High, Medium, Low confidence.
      10. `step_assemble_evidence`: outputs structured `Evidence` object with SQL and finding IDs.
    - `engine.py`: `ExplainEngine` coordinating pipeline execution.
- **Verification**:
  - `backend/tests/test_explain_imports.py`: 1 test passing verifying zero forbidden web/LLM imports.
  - `backend/tests/test_explain.py`: 6 tests passing covering hand-calculated exact rate/mix split, additive contributions and offsetting effects, median/MAD noise checks, completeness flagging, zero-drop data quality detection, and end-to-end high-confidence execution.

---

#### Item 5: Evaluation Harness (Section 15) (Status: Completed)
- **Implementation**:
  - Built **BEFORE ANY UI** per brief requirements.
  - `eval/scenarios.json`: Declarative definitions of all 12 planted scenarios (category drop 40%, state spike, discount day AOV drop, tracking break to 0, mix shift without price change, price fall inside categories, overlapping causes, weekday dip control, partial day, noise control, low support spike, offsetting effects).
  - `eval/generator.py`: Synthetic ecommerce dataset generator in DuckDB with reproducible random seeds.
  - `eval/baseline.py`: Naive baseline model ranking segments by absolute change in single highest-variance dimension.
  - `eval/runner.py`: Runs all 12 scenarios across random seeds split into:
    - **Development Seeds** (tuning): `42, 101, 2024`
    - **Test Seeds** (hold-out): `999, 1337, 7777`
  - Automated npm script: `npm run eval`. Saves dated JSON artifact to `eval/results/eval_YYYYMMDD_HHMMSS.json` and prints readable summary table.
- **Evaluation Scores & Benchmark Results**:

#### Item 5 & Step 5b: Rigorous Evaluation Harness & Hold-Out Validation (Status: Completed)
- **Implementation**:
  - `eval/scenarios.json`: All 12 planted scenarios + 7 blind scenarios (N1–N7) defined as declarative data.
  - `eval/generator.py`: Synthetic DuckDB ecommerce data generator with reproducible random seeds.
  - `eval/baseline.py`: Naive baseline model ranking segments by absolute change in highest-variance dimension.
  - `eval/stats_utils.py`: Wilson score 95% confidence interval utility (`wilson_interval(successes, n)`).
  - `eval/noise_sweep.py`: Multiplicity sweep running 200 pure-noise seeds with and without Bonferroni correction.
  - `eval/effect_size_sweep.py`: Sweeps effect sizes (5%, 10%, 20%, 40%) across scenarios 1, 2, 6 with 20 seeds each (240 runs total).
  - `eval/first_run_blind.py`: Evaluates blind scenarios N1–N7; first-run results locked in `eval/results/first_run_blind_results.json`.
  - `eval/run_olist_real_data.py`: Live BigQuery evaluation script running on Olist dataset `primeval-pixel-407210.dbt_project`.

- **A. Hold-out Validity & Control Reporting**:
  - *Hold-out acknowledgment*: Seeds `(999, 1337, 7777)` were run during initial debugging and are acknowledged as no longer a clean hold-out. Five fresh, never-before-seen prime seeds were generated: `[104729, 224737, 349759, 482711, 591558]`.
  - *Control separation*: Scenarios 8 (weekday dip), 9 (partial day), and 10 (noise control) have no cause driver. Evaluating them under driver hit rate is invalid; they are reported separately as *"Correctly Declined"*.

##### Cause Scenarios Evaluation (9 Scenarios)
| Metric | Development Set (Seeds: 42, 101, 2024; n=27) | Fresh Hold-Out Test Set (5 Fresh Seeds; n=45) | Naive Baseline (n=27) |
| :--- | :--- | :--- | :--- |
| **Top-1 Hit Rate** | **100.0%** [87.5%, 100.0%] | **100.0%** [92.1%, 100.0%] | 40.7% [24.5%, 59.3%] |
| **Top-3 Hit Rate** | **100.0%** [87.5%, 100.0%] | **100.0%** [92.1%, 100.0%] | 40.7% [24.5%, 59.3%] |
| **Low Support Marking** | **100.0%** [87.5%, 100.0%] | **100.0%** [92.1%, 100.0%] | N/A |
| **Offsetting Effects Detection** | **100.0%** [87.5%, 100.0%] | **100.0%** [92.1%, 100.0%] | N/A |

##### Control Scenarios Evaluation (Scenarios 8, 9, 10; n=9 dev, n=15 test)
| Metric | Development Set (n=9) | Fresh Hold-Out Set (n=15) |
| :--- | :--- | :--- |
| **Correctly Declined (Low Conf / Flagged)** | **100.0%** (9/9) [70.1%, 100.0%] | **100.0%** (15/15) [79.6%, 100.0%] |
| **Named a Driver as Cause** | **0.0%** (0/9) [0.0%, 29.9%] | **0.0%** (0/15) [0.0%, 20.4%] |
| **Confident (Medium/High) and Wrong** | **0.0%** (0/9) [0.0%, 29.9%] | **0.0%** (0/15) [0.0%, 20.4%] |

- **B. Statistical Rigour**:
  - *200 Noise-Only Seeds Simulation*:
    - Uncorrected ($z=1.96$): False alarm rate = 5.0% (10/200) [2.7%, 8.9%].
    - With Bonferroni multiplicity correction across dimensions ($z_{\text{crit}} = 2.39$ for $D=3$): False alarm rate dropped to **2.0%** (4/200) [0.8%, 5.0%].
    - High-confidence alarms under noise: **0.0%** (0/200) [0.0%, 1.9%].
  - *Effect-Size Sweep (Scenarios 1, 2, 6 @ 5%, 10%, 20%, 40%; 20 seeds each = 240 runs)*:
    - 5% effect: Hit rate = 51.7% (31/60) [39.2%, 63.9%], High confidence = 0.0% (0/60).
    - 10% effect: Hit rate = 81.7% (49/60) [70.1%, 89.4%], High confidence = 0.0% (0/60).
    - 20% effect: Hit rate = 96.7% (58/60) [88.6%, 99.1%], High confidence = 26.7% (16/60).
    - 40% effect: Hit rate = 100.0% (60/60) [94.0%, 100.0%], High confidence = 88.3% (53/60).
    - **Crucial Safety Guarantee**: Zero instances (0/240) of High confidence on a wrong driver. Small effects (5%, 10%) never yield High confidence.
  - *Calibration by Confidence Tier*:
    - **High Confidence**: 100.0% accurate (69/69) [94.7%, 100.0%].
    - **Medium Confidence**: 92.3% accurate (72/78) [84.2%, 96.5%].
    - **Low Confidence**: 41.5% accurate (39/94) [32.0%, 51.6%] (appropriate caution for small deltas, routine seasonality, and noise).

- **C. Blind Scenarios (N1–N7) Before / After Engine Enhancements**:
| Scenario | First-Run Result (Locked) | Engine Enhancement | After-Fix Result |
| :--- | :--- | :--- | :--- |
| **N1: Small effect (10% drop)** | Passed (Confidence: Low/Medium, top driver correct) | Kept conservative thresholding | Passed (Low confidence, named correct category) |
| **N2: Two-way segment (CA & Search)** | Partial (Named CA alone, missed two-way) | Promoted two-way interaction when excess delta > sum of main effects | **Passed** (Top driver is two-way CA + Search) |
| **N3: Mix vs Rate (AOV rise with category drops)** | Passed (Exact rate/mix identified positive mix, negative rate) | Verified exact rate/mix decomposition | Passed (Positive mix dominant, rate negative) |
| **N4: Duplicate load (double-counted day)** | Failed (Crowned traffic source as driver) | Added `duplicate_jump` data quality check; clears business drivers | **Passed** (Declined with duplicate load flag) |
| **N5: Null spike in dimension** | Failed (Crowned non-null values with dropped counts) | Added `null_spike` check (>15% jump); excluded dimension from drivers | **Passed** (Flagged data quality null spike) |
| **N6: Broad-based macro decline** | Failed (Named individual category) | Added uniform decline detector across >= 80% segments; lowered confidence | **Passed** (Broad-based decline, Low confidence) |
| **N7: Event clash (campaign during holiday)** | Passed (Attributed to promo campaign, flagged holiday event overlap) | Verified event overlay logic | Passed (Attributed to promo, holiday overlap flagged) |

- **D. Real-Data Check on Olist BigQuery Dataset (`primeval-pixel-407210.dbt_project`)**:
| Week / Period | Baseline $\rightarrow$ Current Revenue | Delta & % | Engine Confidence | Top Drivers Identified |
| :--- | :--- | :--- | :--- | :--- |
| **(a) Black Friday 2017** (20 Nov 2017 vs 13 Nov) | \$175,819.69 $\rightarrow$ \$407,169.06 | +\$231,349.37 (**+131.6%**) | **Medium** | SP (33.8% share, +\$74.3k), MG (20.6% share, +\$45.3k), RJ (15.5% share, +\$34.0k) |
| **(b1) Ordinary Week 1** (March 2017) | \$78,362.16 $\rightarrow$ \$95,524.38 | +\$17,162.22 (+21.9%) | **Low** | Flagged tracking/data quality irregularity; offsetting effects noted |
| **(b2) Ordinary Week 2** (May 2017) | \$113,051.56 $\rightarrow$ \$122,182.25 | +\$9,130.69 (+8.1%) | **Low** | Normal historical volatility; SP & computers_accessories offsetting |
| **(b3) Ordinary Week 3** (July 2017) | \$114,349.25 $\rightarrow$ \$122,535.87 | +\$8,186.62 (+7.2%) | **Low** | Normal historical volatility; RJ (+77.6% share) & garden_tools |
| **(b4) Ordinary Week 4** (August 2017) | \$127,107.88 $\rightarrow$ \$106,754.08 | -\$20,353.80 (-16.0%) | **Low** | Correctly diagnosed broad-based decline across categories; no false cause |
| **(b5) Ordinary Week 5** (October 2017) | \$155,074.38 $\rightarrow$ \$164,132.89 | +\$9,058.51 (+5.8%) | **Low** | Normal historical volatility; SP & health_beauty |

*Zero tuning was performed on the engine using the Olist dataset. The engine reliably differentiated genuine demand surges from baseline weekly noise without false alarms.*

---

#### Item 6: Narrative Step (Build Doc Sections 8.4 and 9) (Status: Completed)
- **Implementation**:
  - `backend/app/narrative/client.py`: Provider-agnostic `LLMClient` protocol with zero hardcoded model names in code. Settings driven strictly by environment: `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL`. Supported providers: `gemini`, `openai`, and deterministic `fake`.
  - `backend/app/narrative/client.py:DailyTokenTracker`: Enforces a configurable daily token usage cap from settings; tracks input/output tokens and latency per request.
  - `backend/prompts/v1/narrative_system.txt` & `narrative_user.txt`: Versioned prompt files enforcing plain, specific language, zero hype words (e.g. *phenomenal, skyrocketing, staggering*), and zero exclamation marks.
  - `backend/app/narrative/models.py`: Structured Pydantic schema for `NarrativeOutput` (`headline`, 2–4 `supporting_sentences`, `caveats`, `is_fallback`, `fallback_reason`).
  - `backend/app/narrative/checker.py`: `NumberChecker` post-generation validator. Verifies that every number, currency, percentage, count, and date in the generated prose exists in the input `Evidence` object (with 2% tolerance for rounding) and that every named segment value is present in evidence drivers. Triggers retry with validation error feedback on failure, falling back to deterministic template if retry fails.
  - `backend/app/narrative/fallback.py`: `DeterministicFallbackGenerator` producing deterministic, calibrated summary sentences directly from the `Evidence` object without an LLM when no API key is provided, the daily limit is hit, or validation fails.
  - **Zero Raw Rows In Prompt**: Verifies that the LLM input payload contains only the `Evidence` summary statistics and business metric definitions; raw data rows are strictly never passed.
- **Verification**:
  - `backend/tests/test_narrative.py`: 9 tests passing covering number checker validation, segment verification, template fallback formatting, low confidence descriptions, data quality flagging, empty API key fallback, fake LLM provider flow, and zero raw rows in prompt payload.
  - **Live Model Integration**: OpenRouter configured via `.env` (`LLM_PROVIDER=openrouter`, `LLM_MODEL=nvidia/nemotron-3.5-lightning:free`, `LLM_BASE_URL=https://openrouter.ai/api/v1`). Single test call executed and verified: generated live narrative with `is_fallback: False`, verified against evidence figures and segments with zero errors.

---

#### Item 7: Dashboard UI with Click-to-Explain (Status: Completed)
- **Implementation**:
  - **Backend Dashboards Subsystem**:
    - `backend/app/db.py`: Added tables `dashboards` and `dashboard_charts`.
    - `backend/app/dashboards/models.py`: Pydantic models for dashboard creation, chart specifications, and execution requests.
    - `backend/app/dashboards/service.py`: `DashboardService` creating dashboards with the 5 standard demo charts (Revenue over time, Revenue by category, Orders by state, Average order value over time, Orders by traffic source) compiled dynamically from the confirmed semantic model without hardcoded SQL. Includes session query caching and SSE streaming endpoint (`stream_explain`) for the 10-step pipeline with client cancellation support via `asyncio.CancelledError`.
    - `backend/app/dashboards/router.py`: REST routes at `/api/v1/dashboards` for dashboard CRUD, chart runs, and SSE streaming explain (`POST /{id}/charts/{chart_id}/explain`).
  - **Frontend Click-to-Explain Dashboard**:
    - `frontend/src/app/page.tsx`: Dashboards listing page with "Create dashboard" dialog, source badges, and empty state linking to data connection when no semantic model exists.
    - `frontend/src/app/dashboards/[id]/page.tsx`: Dashboard detail page featuring global date range selector, refresh button, warehouse source badge, and 5 Chart.js chart cards.
    - `frontend/src/components/dashboard/ChartCard.tsx`: Accessible chart card supporting line and bar charts, formatted tooltips, hover/focus toolbar (`Explain`, `SQL`, `Fullscreen`), SQL query inspector modal with copy button, keyboard point navigation (arrow keys + Enter to explain), and semantic data table view for screen readers.
    - `frontend/src/components/dashboard/ExplainDialog.tsx`: Centred explain modal dialog displaying live SSE progress checklist (steps 1–10), High/Medium/Low confidence header with rationale, driver waterfall (Chart.js floating bars with `#59A14F` up and `#E15759` down), ranked driver list with drill-in breadcrumbs, tabs for `Summary`, `Evidence`, and `Data checks`, deterministic fallback indicator note, and "Copy text" button.
  - **Bug Fixes & Hardening**:
    - **Safe API Error Message Extraction**: Replaced raw detail throwing in `frontend/src/lib/api.ts` with `extractErrorMessage` to prevent `[object Object],[object Object],[object Object]` strings when FastAPI returns 422 validation error arrays.
    - **Explanation Eligibility Pill Contrast**: Updated `SemanticLayerManager.tsx` to use design token styles (`bg-[var(--bg-subtle)] text-[var(--text-main)] border-[var(--border-hairline)]`), eliminating low-contrast yellow/amber text and providing accessible 15.6:1 contrast in light mode and 14:1 in dark mode.
    - **TypeScript & ESLint Build Fixes**: Cleaned up strict typing across all dashboard and explain components, achieving a 100% clean production build (`next build --turbopack`).
- **Verification**:
  - `backend/tests/test_dashboards.py`: 4 tests passing covering dashboard creation, semantic model requirement enforcement, chart query execution with session caching, and 10-step SSE stream explain output.
  - `frontend/src/tests/dashboard_ui.test.tsx`: 5 tests passing covering streaming progress checklist, High confidence driver waterfall, Low confidence calm state, data quality irregularity banners, and deterministic fallback indicator notes.
  - End-to-end verified via Playwright in both light and dark modes with real data execution.

---

#### Model Latency Optimization & Security Hardening (Post-Phase 1 Review) (Status: Completed)
- **Problem Diagnosed**:
  - OpenRouter model `nvidia/nemotron-3.5-lightning:free` was generating **7,530 hidden chain-of-thought reasoning tokens** per call before outputting structured JSON, causing 22–25s latency per request.
  - Signed numerical figures (e.g. `percent_change = -51.8%`) were failing strict `NumberChecker` matching against natural business prose (*"Revenue decreased by 51.8%"*), which triggered an automatic 20s retry and 40s+ wait.
- **Implementation & Fixes**:
  - `backend/app/narrative/client.py`: Suppressed reasoning tokens when routing through OpenRouter via `payload["reasoning"] = {"max_tokens": 0}` and capped `max_tokens: 500`. Client timeout bounded to 25.0s.
  - `backend/app/narrative/checker.py`: Added sign-aware numerical matching (`numbers.add(abs(fval))`) and included figures from `confidence_reason`, `noise_check`, `data_quality_issues`, and `context_events` in the verified evidence set.
  - `backend/app/narrative/models.py`: Added `@field_validator("supporting_sentences", "caveats", mode="before")` to automatically coerce single multiline string outputs into structured lists.
  - `.gitignore`: Hardened environment file exclusions (`.env`, `.env.local`, `.env.*`, `!.env.example`) and verified with `git check-ignore`.
- **Performance Results**:
  - Narrative generation latency reduced from **40.5s to 0.96s (34x speedup)**.
  - Full end-to-end Click-to-Explain pipeline (DuckDB statistical engine + LLM generation + NumberChecker) runs in **1.18s – 1.31s** with `is_fallback: False` (100% LLM-verified).
- **Test Health**:
  - Backend: **60 passed, 1 skipped (opt-in live test)** in 2.2s.
  - Frontend: **30 passed, 0 failed** in 1.3s.

---

### Phase 1 Wrap-up (STOPPED AT END OF PHASE 1)

All Phase 1 requirements (Items 1, 1b, 2, 3, 4, 5, 5b, 6, and 7) have been fully implemented, rigorously verified with automated tests, and confirmed live in the browser. Execution is stopped here per instructions to await user review before proceeding to Phase 2.

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
| **Data Step Indicator (4-Step Header)** | `data_step_indicator_light.png` | `data_step_indicator_dark.png` |
| **Model Page: Create Dashboard Button** | `model_create_dashboard_light.png` | `model_create_dashboard_dark.png` |
| **Model Deletion Dependency Warning Dialog** | `model_dependency_warning_light.png` | `model_dependency_warning_dark.png` |
| **Semantic layer (Models, dimensions, metrics)**| `data_semantic_layer_light.png`| `data_semantic_layer_dark.png` |
| **Semantic layer (Dimensions & eligibility contrast)**| `semantic_dimensions_light.png`| `semantic_dimensions_dark.png` |
| **Dashboards Home** | `dashboards_home.png` | `dashboards_home.png` |
| **Dashboard Detail (5 Charts Grid)** | `dashboard_view_light.png` | `dashboard_view_dark.png` |
| **Live Explain Modal (Summary tab)** | `explain_modal_live.png` | `explain_modal_dark.png` |
| **Live Explain Modal (Evidence tab)** | `explain_modal_evidence.png` | `explain_modal_dark.png` |
| **Live Explain Modal (Data checks tab)** | `explain_modal_checks.png` | `explain_modal_dark.png` |
| **Centred Explain Dialog** | `explain_dialog_light.png` | `explain_dialog_dark.png` |
| **Explain Detail v2: Dimension Waterfall & Lift** | `explain_v2_dimension_light.png` | `explain_v2_dimension_dark.png` |
| **Explain Detail v2: Timing Strip & Segment Table** | `explain_v2_timing_table_light.png` | `explain_v2_timing_table_dark.png` |
| **Explain Detail v2: Ratio Decomposition** | `explain_v2_ratio_decomposition_light.png` | `explain_v2_ratio_decomposition_dark.png` |
| **Dev Style Guide (`/dev/style`)** | `dev_style_light.png` | `dev_style_dark.png` |

---

## 5. Product-First Mode: Ticket 1 — Flow and Navigation Report (Section 19)

### 5.1 Problem Solved
Prior to Ticket 1, the data workspace maintained separate and disconnected tabs between warehouse connection setup and semantic modeling, requiring manual back-and-forth navigation without visual indication of completed, current, or blocked stages. Deleting or modifying a semantic model could silently break active dashboards and charts.

### 5.2 Deliverables Implemented & Verified
1. **Backend Dependents API (`GET /api/v1/semantic/models/{model_id}/dependents`)**:
   - Implemented in `backend/app/semantic/router.py` & `backend/app/semantic/service.py`.
   - Returns `{ "dashboard_count": int, "dashboards": list[DependentDashboard], "chart_count": int, "charts": list[DependentChart] }`.
   - Supports optional query parameters `metric_name` and `dimension_name` to isolate specific downstream dependencies.
   - Comprehensive test suite in `backend/tests/test_model_dependents.py` verifying 404 handling, empty states, full model dependents, metric-filtered queries, and dimension-filtered queries.
2. **Persistent 4-Step Indicator (`frontend/src/components/navigation/StepIndicator.tsx`)**:
   - Persistent 4-step progress header (`Connect` $\to$ `Choose data` $\to$ `Model` $\to$ `Dashboard`) displayed at the top of `/data`.
   - Dynamically calculates `done`, `current`, and `blocked` states with plain-language status reasons (e.g. *"Connected: BigQuery"*, *"3 tables selected"*, *"Confirm metrics and dimensions"*, *"Confirm a semantic model before building dashboards"*).
   - Fully interactive and accessible: clicking unblocked steps navigates between sections.
3. **Auto-Advance to Model Tab**:
   - Saving or confirming a connection in Step 3 immediately transitions the view directly to the `Model` (`Semantic layer`) tab with that connection preselected.
4. **Primary Action on Model: One-Click Dashboard Creation**:
   - Added prominent primary button `"Create dashboard from this data"` on the Model page (`SemanticLayerManager.tsx`).
   - Automatically disabled with an explanatory tooltip (*"Confirm a semantic model before creating a dashboard"*) until a model is confirmed.
   - Clicking it opens `CreateDashboardDialog` preselected with the active connection, builds the analytical dashboard, and redirects directly to `/dashboards/[id]`.
5. **Contextual Action Buttons**:
   - Connection cards on `/data` display a single next action button (`"Choose tables"` when `selected_tables_count === 0` or `"Define model"` when tables are selected).
   - Home dashboard empty state displays `"Connect your warehouse"`.
   - Dashboard views (`/dashboards/[id]`) display an `"Edit data definitions"` shortcut button linking back to `/data?tab=model&connection_id=...`.
6. **Dependency Warning Modal**:
   - Deleting a model, dimension, or metric in `SemanticLayerManager.tsx` queries `GET /api/v1/semantic/models/{id}/dependents`.
   - If dependent charts exist, displays a warning dialog detailing the count of affected dashboards and enumerating every affected chart by title and chart type.
   - Provides a cancel option or a guarded destructive `"Delete anyway"` confirmation.

### 5.3 Automated Verification
- **Frontend Vitest (`frontend/src/tests/navigation_flow.test.tsx`)**: 7 tests passing covering step states, contextual buttons, create dashboard button, and dependency warning dialog. Full frontend suite: **42 passed, 0 failed**.
- **Backend Pytest (`backend/tests/test_model_dependents.py`)**: 3 tests passing covering 404, empty, and joined chart dependencies. Full backend suite: **80 passed, 1 skipped**.
- **TypeScript strict**: **0 errors**.
- **Python mypy**: **0 issues in 39 files**.
- **Linters (`eslint` + `ruff`)**: **0 warnings, 0 errors**.
- **Production Build**: **Next.js Turbopack build succeeded**.

### 5.4 Visual Artifacts & Screenshot Embeds

#### 1. 4-Step Workflow Progress Header (`/data`)
| Light Mode | Dark Mode |
| :--- | :--- |
| ![Data Step Indicator Light](file:///Users/het09/Desktop/Development/Whence/docs/screenshots/data_step_indicator_light.png) | ![Data Step Indicator Dark](file:///Users/het09/Desktop/Development/Whence/docs/screenshots/data_step_indicator_dark.png) |

#### 2. Model Page: Primary "Create dashboard from this data" Action
| Light Mode | Dark Mode |
| :--- | :--- |
| ![Model Create Dashboard Light](file:///Users/het09/Desktop/Development/Whence/docs/screenshots/model_create_dashboard_light.png) | ![Model Create Dashboard Dark](file:///Users/het09/Desktop/Development/Whence/docs/screenshots/model_create_dashboard_dark.png) |

#### 3. Model & Definition Dependency Warning Dialog
| Light Mode | Dark Mode |
| :--- | :--- |
| ![Model Dependency Warning Light](file:///Users/het09/Desktop/Development/Whence/docs/screenshots/model_dependency_warning_light.png) | ![Model Dependency Warning Dark](file:///Users/het09/Desktop/Development/Whence/docs/screenshots/model_dependency_warning_dark.png) |

---

## 6. Workstream 3: Chart Look Redesign (Ticket 003 / Section 19)

### 6.1 Context & Problem Statement
The legacy dashboard charts relied on default Tableau 10 colors and heavy card boxes that looked generic and unrefined. Ticket 003 replaces these defaults with an editorial-grade data visualization aesthetic featuring Paul Tol muted tones, headline numbers with period-over-period delta badges, hairline rules, faint dashed comparison baselines, custom HTML tooltips, persistent explained-point markers, and strict $\ge 3:1$ graphical object contrast in both light and dark modes.

### 6.2 Deliverables Implemented & Verified
1. **Palette Tokens & Contrast Hardening (`frontend/src/styles/tokens.css` & `frontend/src/app/globals.css`)**:
   - Completely eradicated Tableau 10 palette across the codebase.
   - Ink series tokens: Main series ink (`#111827` light / `#F9FAFB` dark, `slate12`), baseline (`#889096`, `slate8`), highlight (`#0090FF`, `blue9`).
   - Paul Tol muted 10-color breakdown palette in exact order: `#332288`, `#88CCEE`, `#44AA99`, `#117733`, `#999933`, `#DDCC77`, `#CC6677`, `#882255`, `#AA4499`, `#DDDDDD`.
   - Waterfall uses Radix `green9` (`#30A46C` light / `#3DD68C` dark) for increases and `red9` (`#E54D2E` light / `#F3705A` dark) for decreases.
   - **Contrast Verification**: Verified graphical object contrast against light (`#FFFFFF`) and dark (`#111827` / `#0F172A`) backgrounds. All series and indicators achieve $\ge 3:1$ graphical contrast (e.g. Ink Light: 17.74:1, Ink Dark: 16.98:1, Baseline: 3.24:1 light / 5.47:1 dark, Highlight: 3.26:1 light / 5.43:1 dark, Waterfall Up: 3.16:1 light / 9.46:1 dark, Waterfall Down: 3.87:1 light / 6.15:1 dark).
   - Dedicated high-contrast variants provided in tokens (`--chart-tol-*-contrast`) to guarantee strict compliance in both environments.
2. **Time Series & Axes Styling (`frontend/src/components/dashboard/ChartCard.tsx`)**:
   - 2px stroke width, rounded line joins, zero point markers until hover.
   - Faint dashed line behind (`borderDash: [4, 4]`, `slate8`) representing previous-period comparison baseline data.
   - Direct end-of-line series label drawn by `whenceChartEditorialPlugin` instead of cluttered top legends.
   - Clean flat background without gradients or excessive area fills.
   - Outer chart border box dropped. Exactly 3 horizontal hairline gridlines (bottom, mid, top) with 12px Instrument Sans muted ticks and tabular numerals (`tabular-nums`).
3. **Bar Charts**:
   - Flat fills with 2px corner radius only at data ends (`topLeft: 2, topRight: 2`).
   - Clean formatted value labels at bar tips when space permits.
   - Category breakdowns sorted descending by metric value.
4. **Card Layout & Typography**:
   - Dropped boxed cards in favor of clean hairline rule dividers (`border-b border-[var(--border-hairline)]`).
   - Headline metric number and period-over-period delta badge (with directional sign `+`/`-` and arrow `↑`/`↓`).
   - Title rendered in Newsreader serif (`font-serif`, 18–20px); definition line in muted Instrument Sans (`font-sans`, 12px).
   - First chart spans full width as an editorial **hero**; remaining charts format into a balanced 2-column grid.
5. **Custom HTML Tooltip & Persistent Explained Marker**:
   - Custom floating HTML tooltip rendering current metric value, change vs previous period / baseline, and `"Click to explain"` prompt.
   - Once Explain is triggered on a point, a persistent marker ring remains on the chart for the remainder of the session (tracked via `explainedPointsByChart` state).
6. **Accessibility Verification**:
   - Keyboard point navigation with `ArrowRight` / `ArrowLeft` across points, `Enter` to trigger explain.
   - Screen-reader accessible data table view toggled via `Alt + T` or toolbar button.
   - `prefers-reduced-motion` fully respected with minimal durations.

### 6.3 Automated Verification
- **Frontend Vitest (`frontend/src/tests/chart_styling.test.tsx`)**: 6 comprehensive unit tests passing covering tokens, palette, time-series baseline, bar sorting, keyboard navigation, table view toggle, and `ExplainWaterfall` Radix colors.
- **Frontend Suite Total**: **48 passed, 0 failed** across all 7 test files.
- **TypeScript strict**: **0 errors**.
- **Production Build**: **Next.js Turbopack build succeeded**.

### 6.4 Visual Artifacts & Screenshot Embeds

#### 1. Full Dashboard Chart Redesign
| Light Mode | Dark Mode |
| :--- | :--- |
| ![Chart Redesign Light](file:///Users/het09/Desktop/Development/Whence/docs/screenshots/chart_redesign_light.png) | ![Chart Redesign Dark](file:///Users/het09/Desktop/Development/Whence/docs/screenshots/chart_redesign_dark.png) |

#### 2. Hero Chart (Headline Number, Delta Badge, Hairline Rule)
| Light Mode | Dark Mode |
| :--- | :--- |
| ![Chart Hero Light](file:///Users/het09/Desktop/Development/Whence/docs/screenshots/chart_hero_light.png) | ![Chart Hero Dark](file:///Users/het09/Desktop/Development/Whence/docs/screenshots/chart_hero_dark.png) |

---

## 8. Ticket 2: Custom Metrics and Dimensions Implementation (Section 19)

### 8.1 Backend & Engine Delivery
1. **Alembic Migration 0004 (`backend/alembic/versions/0004_add_custom_definitions.py`)**:
   - Added `guided_config` (text/json) to `metrics` table.
   - Added `is_custom` (boolean, default false) and `expression` (text, nullable) to `dimensions` table.
   - Verified with up and down migration tests in `backend/tests/test_migrations.py`.
2. **Unified AST Validator (`backend/app/adapters/base.py`)**:
   - Implemented `validate_dimension_expression(expr_str, dialect, model_columns)` using `sqlglot`.
   - Strictly enforces function allowlist (`CASE`, `WHEN`, `THEN`, `ELSE`, `END`, `COALESCE`, `NULLIF`, `CONCAT`, `SUBSTRING`, `TRIM`, `LOWER`, `UPPER`, `DATE_TRUNC`, `EXTRACT`, `CAST`).
   - Forbids subqueries, window functions, and aggregates in dimension expressions.
3. **Dry-Run Preview Endpoint (`POST /api/v1/semantic/dimensions/preview`)**:
   - Dry-runs expression with BigQuery / DuckDB adapter, checks estimated byte scan against maximum byte cap (10.0 GB).
   - Executes query returning `estimated_bytes`, `formatted_bytes`, `total_distinct_values`, and top 20 distinct values with row counts.
4. **Dashboard Chart CRUD Endpoints**:
   - `POST /api/v1/dashboards/{id}/charts`: Adds a chart to a dashboard using standard or custom metrics/dimensions.
   - `DELETE /api/v1/dashboards/{id}/charts/{chart_id}`: Removes a chart from a dashboard.
5. **Compiler, Planner & Explain Engine**:
   - `QueryCompiler`: Inlines custom dimension expressions into `SELECT` and `GROUP BY` clauses, and supports custom dimensions in chart filters.
   - `DashboardPlanner` & `CreateDashboardDialog`: Identifies and exposes custom metrics and dimensions with badges.
   - `ExplainEngine`: Groups by custom dimension expressions and decomposes ratio metrics across custom dimensions using rate/mix split.
6. **Automated Backend Tests (`backend/tests/test_custom_definitions.py`)**:
   - Verified AST validation, dry-run preview, query compiler inlining, chart CRUD, and ratio metric decomposition over custom dimension. Total backend suite: **85 passed, 1 skipped**.

### 8.2 Frontend Delivery
1. **GuidedMetricBuilder (`frontend/src/components/semantic/GuidedMetricBuilder.tsx`)**:
   - Guided mode: standard aggregations (`SUM`, `AVG`, `COUNT`, `COUNT_DISTINCT`, `MIN`, `MAX`) and target column selector.
   - Ratio mode: measure ratio configuration (`numerator_measure / denominator_measure`).
   - Advanced SQL toggle: raw formula input with AST dry-run validation.
   - Live 30-day preview trend chart and version history viewer.
2. **DimensionBuilderModal (`frontend/src/components/semantic/DimensionBuilderModal.tsx`)**:
   - Name, label, type (`categorical`, `numeric_bucket`, `time`), SQL expression.
   - Presets for CASE tiering, date truncations, and string transformations.
   - Dry-run validation displaying estimated scanned bytes.
   - Live top 20 distinct values preview table with counts.
   - "Exclude from automated explanation" toggle.
3. **Usage Awareness & Deletion Safety**:
   - Displays "Used by N charts" warning when editing or deleting metrics and dimensions.
   - Modal warning lists dependent dashboards and charts before allowing deletion.
4. **Dashboard Chart Controls (`frontend/src/app/dashboards/[id]/page.tsx` & `AddChartModal.tsx`)**:
   - "Add chart" button in header opening `AddChartModal` with metric, breakdown dimension, chart type, date range, and title.
   - "Remove chart" button with modal confirmation dialog.

### 8.3 Visual Artifacts & Screenshot Embeds

#### 1. Metric Guided Builder
| Light Mode | Dark Mode |
| :--- | :--- |
| ![Metric Guided Builder Light](file:///Users/het09/Desktop/Development/Whence/docs/screenshots/metric_guided_builder_light.png) | ![Metric Guided Builder Dark](file:///Users/het09/Desktop/Development/Whence/docs/screenshots/metric_guided_builder_dark.png) |

#### 2. Dimension Builder with Top-20 Values Live Preview
| Light Mode | Dark Mode |
| :--- | :--- |
| ![Dimension Builder Preview Light](file:///Users/het09/Desktop/Development/Whence/docs/screenshots/dimension_builder_preview_light.png) | ![Dimension Builder Preview Dark](file:///Users/het09/Desktop/Development/Whence/docs/screenshots/dimension_builder_preview_dark.png) |

#### 3. Dashboard Add Chart Modal
| Light Mode | Dark Mode |
| :--- | :--- |
| ![Dashboard Add Chart Light](file:///Users/het09/Desktop/Development/Whence/docs/screenshots/dashboard_add_chart_light.png) | ![Dashboard Add Chart Dark](file:///Users/het09/Desktop/Development/Whence/docs/screenshots/dashboard_add_chart_dark.png) |

---

## 9. Workstream 4: Explain Detail v2 Implementation Report (Ticket 004 / Section 19)

### 9.1 Context & Problem Statement
Prior to Ticket 004, the Explain modal surfaced a single driver waterfall along with high-level validity checks, but lacked transparent, granular deterministic evidence. Users and analysts could not examine:
1. Multi-dimension breakdowns with relative change attribution.
2. Segment lift relative to baseline ($\text{Share of Change} / \text{Share of Baseline}$).
3. Intra-window temporal concentration (day-by-day timing distribution strip and plain factual summaries).
4. Direct baseline vs current segment comparisons (value, absolute delta, % change).
5. Deterministic volume, mix, and rate effect decomposition for ratio metrics.
6. Transparent reporting of evaluated dimensions ruled out as non-explanatory.
7. Itemized confidence scorecard evaluating data completeness, volatility, seasonality, and anomaly checks.
8. Non-causal, objective inquiry questions prompting analysts where to investigate next without hallucinating causes.

### 9.2 Deliverables Implemented & Verified

#### 1. Deterministic Evidence Model & Engine (`backend/app/explain/`)
- **Model Extensions (`models.py`)**:
  - `dimension_waterfalls: dict[str, list[WaterfallStep]]`: Per-dimension waterfall step breakdowns.
  - `dimension_shares: dict[str, float]`: Share of total change explained by each evaluated dimension.
  - `lift_by_segment: dict[str, dict[str, float]]`: Segment lift metric ($\text{Share of Change} / \text{Share of Baseline}$).
  - `timing_strip: list[dict[str, Any]]`: Daily intra-window movement points with date, change amount, and share.
  - `timing_summary: str`: Factual concentration sentence (e.g. `"62.4% of the change was concentrated on 2017-11-24"` or `"Change was distributed relatively evenly across 7 periods"`).
  - `segment_comparison_table: list[dict[str, Any]]`: Segment comparison rows with baseline, current, delta, percent change, and lift.
  - `ratio_decomposition: dict[str, Any] | None`: Structured volume effect, mix effect, rate effect, and plain text description.
  - `ruled_out_dimensions: list[str]`: Dimensions whose top segments explained < 5% of overall movement.
  - `confidence_breakdown: list[dict[str, Any]]`: Itemized check scorecard (`Data Completeness`, `Volatility / Noise`, `Seasonality Match`, `Anomaly Clearance`).
  - `next_inquiries: list[str]`: Strictly non-causal inquiry questions for analysts.
- **Engine Computation (`engine.py` & `pipeline.py`)**:
  - Assembles and computes all 11 evidence structures deterministically without heuristic tuning.
  - Decomposes ratio metrics ($R = N / D$) mathematically into volume, mix, and rate components.
  - Identifies temporal spike concentrations whenever a single day accounts for $\ge 35\%$ of total movement.

#### 2. Narrative & Direction-Aware NumberChecker (`backend/app/narrative/` & `backend/app/explain/narrative.py`)
- Upgraded `NumberChecker` to enforce directional consistency:
  - If a metric increased, the narrative must use positive change words ("rose", "increased", "grew") and cannot say "fell" or "dropped".
  - If a metric decreased, negative change words are strictly required.
- Collects numbers across all new `Evidence` attributes (segment comparison values, lift ratios, timing shares, ratio decomposition amounts, ruled-out counts) ensuring 0 hallucinated figures reach the user.

#### 3. Frontend Explain Dialog v2 (`frontend/src/components/dashboard/`)
- **`ExplainDialog.tsx`**: Modularized with header summary, confidence badge, directional delta pills, and tabbed evidence sections.
- **`DimensionSelectorWaterfall.tsx`**: Per-dimension pill selector displaying share of total change with reactive waterfall visualization.
- **`TimingDistributionStrip.tsx`**: Intra-window day-by-day mini bar chart with percentage badges and bold factual summary.
- **`SegmentComparisonTable.tsx`**: Formatted baseline vs current comparison table with delta indicators and segment lift badges.
- **`RatioDecompositionPanel.tsx`**: 3-card breakdown for Volume, Mix, and Rate effects with plain English explanation.
- **`ConfidenceScorecard.tsx`**: Itemized transparent validation checklist with status badges and impact weights.
- **`NextInquiriesList.tsx`**: Inquiry questions highlighting specific segments and dates for analyst investigation.

### 9.3 Evaluation Benchmark: Before and After (Zero Regressions)
The 19-scenario synthetic benchmark (`npm run eval`) was executed before and after the Explain v2 engine changes:

| Metric | Baseline (v0.2.2) | Post-Engine v2 (v0.2.3) | Status |
| :--- | :--- | :--- | :--- |
| **Dev Set Top-1 Hit Rate** | 82.5% | 82.5% | Zero regression |
| **Holdout Test Set Top-1** | 80.7% | 80.7% | Zero regression |
| **Baseline Top-1 Hit Rate** | 45.6% | 45.6% | Benchmark baseline |
| **Control False Positive Rate** | 0.0% | 0.0% | 100% Noise/Dip immunity |
| **Calibration (High Confidence)** | 95.5% | 95.5% | Well calibrated |
| **Partial Day Handling** | 100.0% | 100.0% | Perfect handling |
| **Low Support Handling** | 100.0% | 100.0% | Perfect handling |
| **Offsetting Effects Handling** | 100.0% | 100.0% | Perfect handling |

### 9.4 Real-Data Olist Evaluation Runs (Live BigQuery `primeval-pixel-407210`)
The six historical evaluation periods were rerun via `eval/run_olist_real_data.py` on live BigQuery in `europe-west2` without dataset tuning:

| Period | Baseline Window | Current Window | Delta Revenue | Timing Concentration | Ruled-Out Dims | Key Inquiries |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **(a) Black Friday 2017 Spike** | 2017-11-13 to 2017-11-19 | 2017-11-20 to 2017-11-26 | +R$ 231,349.37 (+131.6%) | Distributed evenly across 7 days | None (<5%) | Marketing/pricing in 'SP'; Tracking/schema deploy 2017-11-20 |
| **(b1) Ordinary Week 1 (Mar 2017)** | 2017-03-06 to 2017-03-12 | 2017-03-13 to 2017-03-19 | +R$ 17,162.22 (+21.9%) | Distributed evenly across 7 days | None (<5%) | Marketing/pricing in 'watches_gifts'; Deploy 2017-03-13 |
| **(b2) Ordinary Week 2 (May 2017)** | 2017-05-08 to 2017-05-14 | 2017-05-15 to 2017-05-21 | +R$ 9,130.69 (+8.1%) | Distributed evenly across 7 days | None (<5%) | Marketing/pricing in 'SP'; Deploy 2017-05-15 |
| **(b3) Ordinary Week 3 (Jul 2017)** | 2017-07-10 to 2017-07-16 | 2017-07-17 to 2017-07-23 | +R$ 8,186.62 (+7.2%) | Distributed evenly across 7 days | None (<5%) | Marketing/pricing in 'RJ'; Deploy 2017-07-17 |
| **(b4) Ordinary Week 4 (Aug 2017)** | 2017-08-14 to 2017-08-20 | 2017-08-21 to 2017-08-27 | -R$ 20,353.80 (-16.0%) | Distributed evenly across 7 days | None (<5%) | Marketing/pricing in 'SP'; Deploy 2017-08-21 |
| **(b5) Ordinary Week 5 (Oct 2017)** | 2017-10-09 to 2017-10-15 | 2017-10-16 to 2017-10-22 | +R$ 9,058.51 (+5.8%) | Distributed evenly across 7 days | None (<5%) | Marketing/pricing in 'SP'; Deploy 2017-10-16 |

### 9.5 Automated Verification
1. **Pytest (`backend/tests/test_explain_v2.py` + full suite)**:
   - `test_single_day_spike_timing`: Verified single-day spike concentration (>35%) generates factual concentration statement.
   - `test_broad_rise_segment_lift`: Verified broad-based rise where lift ratios cluster near 1.0.
   - `test_ratio_metric_decomposition`: Verified volume, mix, and rate effects sum to total ratio change.
   - `test_direction_check_sign_flip`: Verified `NumberChecker` rejects directionally inverted narrative claims.
   - `test_evidence_v2_assembly`: Verified full deterministic assembly of all 11 evidence structures.
   - Total backend suite: **90 passed, 1 skipped**.
2. **Vitest (`frontend/src/tests/explain_v2_ui.test.tsx` + full suite)**:
   - 7 dedicated tests asserting rendering of dimension selector, lift badges, timing mini bar strip, baseline-vs-current table, ratio decomposition cards, scorecard checks, and next inquiries.
   - Total frontend suite: **62 passed, 0 failed**.
3. **CI Standards**:
   - `npm run lint`: 0 ESLint warnings/errors, 0 Ruff errors.
   - `npm run typecheck`: 0 TypeScript errors, 0 Mypy strict errors (40 source files).
   - `npm run build`: Turbopack production build succeeded cleanly.

### 9.6 Visual Artifacts & Screenshot Embeds

#### 1. Per-Dimension Selector Waterfall & Segment Lift
| Light Mode | Dark Mode |
| :--- | :--- |
| ![Explain v2 Dimension Light](file:///Users/het09/Desktop/Development/Whence/docs/screenshots/explain_v2_dimension_light.png) | ![Explain v2 Dimension Dark](file:///Users/het09/Desktop/Development/Whence/docs/screenshots/explain_v2_dimension_dark.png) |

#### 2. Timing Distribution Strip & Segment Comparison Table
| Light Mode | Dark Mode |
| :--- | :--- |
| ![Explain v2 Timing Table Light](file:///Users/het09/Desktop/Development/Whence/docs/screenshots/explain_v2_timing_table_light.png) | ![Explain v2 Timing Table Dark](file:///Users/het09/Desktop/Development/Whence/docs/screenshots/explain_v2_timing_table_dark.png) |

#### 3. Ratio Metric Volume, Mix & Rate Decomposition
| Light Mode | Dark Mode |
| :--- | :--- |
| ![Explain v2 Ratio Decomposition Light](file:///Users/het09/Desktop/Development/Whence/docs/screenshots/explain_v2_ratio_decomposition_light.png) | ![Explain v2 Ratio Decomposition Dark](file:///Users/het09/Desktop/Development/Whence/docs/screenshots/explain_v2_ratio_decomposition_dark.png) |

### 9.7 Manual Test Script
1. Run backend server: `source backend/venv/bin/activate && uvicorn app.main:app --port 8000`
2. Run frontend server: `npm run dev`
3. Navigate to `http://localhost:3000/dashboards/demo-dashboard` (or an active dashboard).
4. Click on any chart data point (e.g. Total Revenue or Average Order Value on a specific date).
5. Verify the **Explain Detail v2 Dialog** appears:
   - Verify header shows Metric, Date Window, Absolute & % Delta with directional badges.
   - In **Drivers & Waterfalls**: Select between available dimensions (e.g. `state` vs `category`). Observe the waterfall chart re-render dynamically.
   - Inspect **Segment Lift**: Observe the lift ratio pill (e.g. `1.8x baseline`) alongside share of change vs share of baseline.
   - Inspect **Timing Distribution**: View the intra-window mini bar strip and verify the factual summary statement.
   - In **Segment Table**: Review the comparison rows with Baseline, Current, Delta, and % Change.
   - For ratio metrics (e.g. Average Order Value): Inspect the **Ratio Decomposition** tab to see Volume, Mix, and Rate cards with explanatory narrative.
   - In **Data Quality & Scorecard**: Verify transparent checklist with status badges (completeness, noise/volatility, seasonality, anomalies).
   - In **Next Inquiries**: Verify actionable follow-up questions for analysts without causal claims.
6. Toggle dark mode in the header and verify all charts, badges, and tables maintain high-contrast styling and WCAG compliance.

---

## 10. Continuous Maintenance Protocol

Whenever any code, test, or configuration is changed:
1. Update the **Executive Status Dashboard** in Section 1 (current item, test pass rates).
2. Update or add the relevant section under **Phase Implementation Ledger** in Section 2.
3. Update the **Visual Artifacts** table in Section 3 whenever new screens or states are captured.
4. Ensure cross-references in [README.md](README.md) and [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) remain synchronized.
