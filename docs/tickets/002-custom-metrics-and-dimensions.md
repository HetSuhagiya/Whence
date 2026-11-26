# Ticket 002: Custom Metrics and Dimensions

## Metadata
- **Workstream**: 2 (Custom Metrics and Dimensions)
- **Size**: Large
- **Dependencies**: Ticket 001
- **Spec Reference**: Spec 002 (AC 2.1 - 2.5)

## Problem & Context
Users cannot build metrics without writing SQL, nor can they create custom derived dimensions (e.g. bucketing delivery days, extract order day of week, or customer tiering). Furthermore, dashboards cannot have charts added or removed without re-running the full planner.

## Acceptance Criteria
1. **Guided Metric Builder**:
   - Guided mode with aggregation selection (`SUM`, `AVG`, `COUNT`, `COUNT_DISTINCT`, `MIN`, `MAX`), column selector, optional filter expression, and ratio mode (Measure A / Measure B).
   - Advanced raw SQL toggle retained with sqlglot AST verification.
   - Retains 30-day preview trend, dry-run validation, and version history.
2. **Custom Dimension Builder**:
   - Form fields: Name, Type (`categorical`, `time`, `numeric_bucket`), Expression (`CASE`, bucketing, date extractions like `EXTRACT(MONTH FROM ...)` or `EXTRACT(DAYOFWEEK FROM ...)`, safe string functions).
   - Real-time dry-run validation and live preview of top 20 distinct values with count.
   - `"Exclude from automated explanation"` toggle.
3. **Usage Awareness & Warnings**:
   - Metric and dimension tables show `"Used by N charts"`.
   - Editing or deleting shows a warning listing the specific charts relying on the definition.
4. **End-to-End System Integration**:
   - Planner, QueryCompiler, and ExplainEngine seamlessly support custom metrics and expression dimensions.
   - ExplainEngine groups by the compiled expression and uses returned value labels for segment analysis.
   - Automated test executes an explanation decomposing a change through a custom expression dimension and a custom ratio metric.
5. **Dashboard Chart Controls**:
   - Minimal `"Add chart"` modal on `/dashboards/[id]` (metric, dimension breakdown, chart type, date range).
   - Minimal `"Remove chart"` button per card with confirmation.

## Technical Tasks
- **Database & Backend**:
  - Alembic Migration `0004_add_custom_definitions.py`: add `guided_config` to `metrics`, `is_custom` and `expression` to `dimensions`.
  - Endpoint `POST /api/v1/semantic/dimensions/preview`: Introspect top 20 values with counts via dry-run and query.
  - Endpoints `POST /api/v1/dashboards/{id}/charts` and `DELETE /api/v1/dashboards/{id}/charts/{chart_id}`.
  - Update `QueryCompiler` to inline custom dimension expressions into `SELECT` and `GROUP BY` clauses.
  - Update `ExplainEngine` dimension discovery to inspect and evaluate custom dimensions.
- **Frontend**:
  - Build `GuidedMetricBuilder.tsx` with aggregation/ratio dropdowns and SQL toggle.
  - Build `DimensionBuilderModal.tsx` with live top-20 values preview table.
  - Add chart addition dialog (`AddChartDialog.tsx`) and removal buttons on `/dashboards/[id]`.

## Test Plan & Verification
- Pytest tests in `backend/tests/test_custom_definitions.py` covering AST expression allowlist, top-20 preview, compiler grouping, and Explain decomposition over a custom dimension and ratio metric.
- Vitest tests in `frontend/src/tests/custom_definitions_ui.test.tsx`.
- Playwright happy-path test creating a custom dimension and custom ratio metric, and querying them on a dashboard chart.
