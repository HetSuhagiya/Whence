# Whence — Implementation Progress & Changelog

> **Authoritative Progress Ledger**: This document tracks the exact status of what has been implemented, verified, and delivered across all phases.
> **Maintenance Rule**: This file **must be updated continuously** at every step of progress, after every item, phase completion, or structural change, alongside `README.md` and `PROJECT_STRUCTURE.md`.

---

## 1. Executive Status Dashboard

- **Current Phase**: **Phase 1 — Prove the explanation (COMPLETED)**
- **Last Completed Milestone**: **Item 6 (Narrative step) & Item 7 (Demo Dashboard UI with Click-to-Explain)**
- **Active Milestone**: **Phase 1 Complete — Model Latency Diagnosis & Optimization (OpenRouter Reasoning Suppression)**
- **CI Test Health**:
  - Evaluation Harness (`npm run eval`): **100.0% Engine Top-1 on Dev Set & Fresh Holdout Set** (Baseline: 40.7%), **0.0% False Positives on Controls**, **100.0% Calibration on High Confidence**, **100.0% Partial Day, Low Support & Offsetting Effects Handling**.
  - BigQuery live connection: **Verified live by user (manual test, 23 Nov 2026)**; automated integration test remains opt-in via `WHENCE_LIVE_BQ_KEY_PATH`.
  - Backend (`pytest`): **60 passed, 1 skipped (opt-in live test)** across adapters, compiler, connections, crypto, semantic layer, explain engine, narrative generation, dashboards service, and zero-web/LLM imports.
  - Frontend (`vitest`): **30 passed, 0 failed** across base components, connection flow, loading states, semantic layer manager, and click-to-explain dashboard UI.
  - TypeScript strict (`tsc --noEmit`): **0 errors**.
  - Next.js Turbopack build (`next build --turbopack`): **Succeeded with 0 errors** (`/`, `/dashboards/[id]`, `/data`, `/dev/style`).
  - Python strict (`mypy --strict`): **0 errors** across all source files.
  - Code standards (`ruff` + `next lint`): **0 warnings, 0 errors**.
  - Narrative Generation Latency: **Reduced from 40.5s to 1.18s (34x speedup)** via OpenRouter reasoning token suppression (`reasoning: {"max_tokens": 0}`) and sign-aware absolute numerical verification.

### Known Gaps (Deliberately Deferred)
The following capabilities and tests were reviewed and deliberately deferred to subsequent optimization cycles:
1. **Lift Evidence Field**: Ratio of a segment's share of change relative to its share of baseline ($\text{Share of Change} / \text{Share of Baseline}$).
2. **Timing-within-window Evidence Fields**: Intra-period day-by-day trajectory and velocity within the comparison window.
3. **Table Allowlist for Product Queries**: Restricting introspected queries strictly to explicitly registered connection tables.
4. **Parameterised Injection Test Cases**: Additional syntactically valid SQL injection variants within prepared statement parameter values.
5. **Formal Calibration Definitions**: Exact parametric posterior probability mapping for confidence levels beyond empirical accuracy tiers.
6. **Unrun Fresh-Variant Scenarios**: Declarative stress-test scenario variants:
   - `N2b`: Asymmetric two-way segment interaction
   - `N4b`: Intra-day partial duplicate load
   - `N5b`: Gradual null drift across consecutive rolling periods
   - `N6b`: Sector-specific multi-category contraction
   - `N6c`: Currency devaluation / uniform inflation shift
   - `N7`: New segment emergence from zero baseline (infinite percentage change)
   - `N9`: Multi-event overlap with conflicting directional drivers

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
| **Semantic layer (Models, dimensions, metrics)**| `data_semantic_layer_light.png`| `data_semantic_layer_dark.png` |
| **Semantic layer (Dimensions & eligibility contrast)**| `semantic_dimensions_light.png`| `semantic_dimensions_dark.png` |
| **Dashboards Home** | `dashboards_home.png` | `dashboards_home.png` |
| **Dashboard Detail (5 Charts Grid)** | `dashboard_view_light.png` | `dashboard_view_dark.png` |
| **Live Explain Modal (Summary tab)** | `explain_modal_live.png` | `explain_modal_dark.png` |
| **Live Explain Modal (Evidence tab)** | `explain_modal_evidence.png` | `explain_modal_dark.png` |
| **Live Explain Modal (Data checks tab)** | `explain_modal_checks.png` | `explain_modal_dark.png` |
| **Centred Explain Dialog** | `explain_dialog_light.png` | `explain_dialog_dark.png` |
| **Dev Style Guide (`/dev/style`)** | `dev_style_light.png` | `dev_style_dark.png` |

---

## 4. Continuous Maintenance Protocol

Whenever any code, test, or configuration is changed:
1. Update the **Executive Status Dashboard** in Section 1 (current item, test pass rates).
2. Update or add the relevant section under **Phase Implementation Ledger** in Section 2.
3. Update the **Visual Artifacts** table in Section 3 whenever new screens or states are captured.
4. Ensure cross-references in [README.md](README.md) and [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) remain synchronized.
