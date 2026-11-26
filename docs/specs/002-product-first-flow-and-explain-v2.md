# Spec 002: Product-First Flow, Custom Definitions, Chart Redesign & Explain v2

## 1. Problem Statement & Scope
Under **Product-First Mode** (Section 20), our goal is to deliver an end-to-end interactive product where every capability terminates in a visible, clickable UI action. This spec covers the four core workstreams required to complete the user journey:
1. **Flow & Navigation**: Seamless journey from connection setup to model confirmation and one-click dashboard creation with full dependency awareness.
2. **Custom Metrics & Dimensions**: Guided builders for metrics (aggregations and measure ratios) and dimensions (expressions, `CASE`, date parts) with dry-run validation, top-20 value preview, impact checking, and automated Explain support.
3. **Chart Look Redesign**: Editorial-grade data visualization replacing Tableau defaults with Paul Tol muted tones, headline numbers with period-over-period delta badges, hairline rules, custom HTML tooltips, persistent explained-point markers, and strict $\ge 3:1$ graphical contrast.
4. **Explain Detail v2**: Deep deterministic evidence hierarchy in the Explain dialog (per-dimension views, segment lift, intra-window timing distribution, baseline vs current tables, ratio volume/mix/rate decomposition, ruled-out dimensions, confidence breakdown, and inquiry-only next checks).

---

## 2. Workstream Breakdown & Acceptance Criteria

### Workstream 1: Flow and Navigation
- **AC 1.1**: Persistent 4-step indicator (`Connect` $\to$ `Choose data` $\to$ `Model` $\to$ `Dashboard`) displayed at the top of the Data workspace showing `done`, `current`, and `blocked` with explicit plain-language reasons.
- **AC 1.2**: Saving or selecting a connection transitions the user directly to the `Model` tab with that connection preselected.
- **AC 1.3**: The Model page features a primary button `"Create dashboard from this data"`, disabled with a tooltip reason until a model is confirmed. Clicking it opens the Create Dashboard dialog prefilled with connection & model, creates the dashboard, and navigates directly to `/dashboards/[id]`.
- **AC 1.4**: Connection cards on `/data` and the empty dashboard state display the exact next missing step as a single call-to-action button. Dashboard pages include an `"Edit data definitions"` shortcut linking directly to the model configuration.
- **AC 1.5**: Deleting or modifying a semantic model warns if existing dashboards or charts depend on it, enumerating the affected charts by name.

### Workstream 2: Custom Metrics and Dimensions
- **AC 2.1**: Guided Metric Builder supports aggregation selection (`SUM`, `AVG`, `COUNT`, `COUNT_DISTINCT`, `MIN`, `MAX`), column picker, optional filter expression, and ratio mode (Numerator Measure / Denominator Measure). Raw SQL remains available under an `"Advanced"` toggle with live dry-run validation, 30-day preview trend, and version history.
- **AC 2.2**: Dimension Builder supports custom expressions (`CASE WHEN ...`, numeric bucketing, date extractions `EXTRACT(MONTH FROM ...)`, `EXTRACT(DAYOFWEEK FROM ...)`, and safe string functions). Uses sqlglot AST allowlist validation, dry-run verification, and generates a preview of the top 20 distinct values with frequency counts. Includes an `"Exclude from automated explanation"` toggle.
- **AC 2.3**: Editing or deleting metrics/dimensions calculates and displays `"Used by N charts"` with confirmation guards.
- **AC 2.4**: Custom metrics and dimensions are recognized and processed by `DashboardPlanner`, `QueryCompiler`, the Create Dashboard dialog, and `ExplainEngine` (grouping by compiled expression with labels from evaluated values). Automated tests verify an explanation over a custom dimension and ratio metric.
- **AC 2.5**: Minimal dashboard editing controls allow users to `"Add chart"` (selecting metric, dimension, chart type, date range) and `"Remove chart"` from `/dashboards/[id]`.

### Workstream 3: Chart Look (Editorial Visual Redesign)
- **AC 3.1**: Palette tokens fully updated:
  - Main series line/bar: Ink (`slate12` / `#111827` light, `#F9FAFB` dark).
  - Baseline comparison: `slate8` (`#889096`).
  - Highlight point: `blue9` (`#0090FF`).
  - Breakdown palette (Paul Tol muted, 10 ordered colors): `#332288`, `#88CCEE`, `#44AA99`, `#117733`, `#999933`, `#DDCC77`, `#CC6677`, `#882255`, `#AA4499`, `#DDDDDD`.
  - Waterfall: Radix `green9` (`#30A46C` increase) and Radix `red9` (`#E54D2E` decrease).
  - Graphical contrast verified $\ge 3:1$ against backgrounds in both light and dark modes.
- **AC 3.2**: Time series styling: 2px stroke, rounded joins, zero point markers until hover, faint dashed previous-period comparison line, direct end-of-line series labels (no top legends), and clean flat background without gradients.
- **AC 3.3**: Axes styling: No outer border box; exactly 3 horizontal hairline gridlines; 12px muted ticks in Instrument Sans; tabular numerals enabled.
- **AC 3.4**: Bar charts: Flat fills, 2px corner radius at data ends only, formatted value labels placed at bar tips when space permits, sorted descending by metric value.
- **AC 3.5**: Chart containers: Boxed cards replaced with elegant hairline separators. Each section features a headline metric number with period-over-period delta badge (with directional sign & arrow), serif title in Newsreader, and muted definition line. The primary chart spans full width; secondary charts format into a balanced two-column grid.
- **AC 3.6**: Custom HTML tooltip showing current value, absolute/percentage change vs previous period, and `"Click to explain"` affordance.
- **AC 3.7**: Once explained, the target point retains a persistent highlight marker on the chart for the remainder of the session.
- **AC 3.8**: Full keyboard navigation, table view toggle (`Alt + T`), and `prefers-reduced-motion` compliance retained.

### Workstream 4: Explain Detail v2 (Deterministic Evidence First)
- **AC 4.1**: `Evidence` model and Explain dialog extended with:
  - **Per-dimension selector**: Dropdown of all searched dimensions showing overall share explained, with dynamic waterfall rendering for the active dimension.
  - **Segment Lift**: Comparison metric showing each segment's share of change alongside its share of baseline ($\text{Share of Change} / \text{Share of Baseline}$).
  - **Intra-window Timing Distribution**: Day-level or week-level contribution strip within the comparison window, accompanied by deterministic summary sentence (e.g. `"62% of the change was concentrated on Fri 24 Nov"`).
  - **Segment Table**: Tabular breakdown of baseline vs current values, absolute delta, and percentage change.
  - **Ratio Metric Decomposition**: Explicit plain-language breakdown of Volume, Mix, and Rate effects for ratio metrics.
  - **Ruled-out Dimensions**: Clear summary of candidate dimensions evaluated whose segments did not exceed significance thresholds.
  - **Confidence Breakdown**: Transparent checklist displaying the specific deterministic tests passing or warning (completeness, volatility/noise, seasonality, data quality).
  - **Next Checks**: Unbiased, factual investigation suggestions (never attributing unproven causality).
- **AC 4.2**: Verified LLM Narrative & NumberChecker: Narrative text strictly draws from the verified `Evidence` fields; `NumberChecker` with directional verification validates narrative assertions. Tested across the six real Olist historical periods without tuning.

---

## 3. Architecture & Data Model Changes
- **Alembic Migration 0004**:
  - `metrics`: Add `guided_config` JSON column (stores `agg_func`, `source_column`, `filter_expr`, `numerator_measure`, `denominator_measure`).
  - `dimensions`: Add `is_custom` (boolean), `expression` (text).
- **API Enhancements**:
  - `POST /api/v1/semantic/dimensions/preview`: Executes dry-run and retrieves top 20 distinct values with row counts.
  - `GET /api/v1/semantic/models/{id}/dependents`: Returns count and list of dashboards/charts utilizing the model or specific metrics/dimensions.
  - `POST /api/v1/dashboards/{id}/charts`: Add dynamic chart to dashboard.
  - `DELETE /api/v1/dashboards/{id}/charts/{chart_id}`: Remove chart from dashboard.
- **Threat Model**:
  - All custom expressions (metrics and dimensions) validated through `sqlglot` AST against strict SELECT-expression allowlist (no subqueries, DDL, DML, or external calls).
  - Mandatory warehouse dry-run before storing custom definitions.
  - Aggregate queries only dispatched to database and LLM; zero raw customer/order records transferred.

---

## 4. Verification Plan
1. **Logic & Regression Tests**: Pytest tests for dimension builder preview, custom dimension compilation, custom ratio metric Explain decomposition, and dependency resolution.
2. **Playwright Happy-Path**: Fresh SQLite database, mocked Olist connection + DuckDB demo, step indicator traversal, model confirmation, one-click dashboard creation, custom metric/dimension addition, chart point selection, and Explain v2 dialog verification.
3. **Visual Verification**: Light and dark mode screenshots for Flow, Custom Definitions, Chart Look, and Explain Detail v2.
