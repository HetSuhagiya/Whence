# Whence — build prompt for the coding agent

Version 1 · 23 Nov 2026 · Give this whole document to the agent as its brief. Build in the phases at the end and stop after each one.

## 1. How you should work

You are building **Whence**, a web product, from scratch. Read this whole brief before writing code.

- Follow the phases in section 14 and the engineering process in section 20. Finish a phase, run its checks, report, then stop and wait for approval. Do not start the next phase on your own.
- Do not invent features outside this brief. If something is ambiguous, pick the simplest reasonable option, state the assumption in your report, and carry on. Ask only when a wrong guess would be expensive to undo.
- Never claim something works unless you ran it. Your reports must say what you tested, how, and what you did not test.
- No placeholder data, fake metrics, lorem ipsum or hardcoded numbers in anything a user sees. Sample data must come from a real dataset or the generated test dataset.
- Strict types everywhere (TypeScript strict mode, typed Python). Write tests for the analysis code. Keep functions small and named for what they do.
- Configuration comes from environment variables. The LLM key and model will be supplied later, so build against the settings in section 9 and provide `.env.example`.

## 2. The product in one paragraph

Traditional dashboards (Tableau, Looker Studio, Power BI) show that sales or cost moved, or which products lead, but not why. Whence connects to a data warehouse, builds the dashboard the user asks for, and then lets the user **click any chart, or any data point on it, to get the reason behind the movement**, with no typing. One click also gives a forecast, a period comparison or an anomaly scan. Users can edit every chart and define their own metric calculations, and the dashboard and the explanations both use those definitions.

The promise is **trustworthy explanations**. Many tools already offer click-to-explain, so the difference must come from quality: every explanation is computed by deterministic code, shows its evidence and SQL, states its confidence, and says plainly when the data cannot explain a change. The language model writes up the findings. It never decides what the cause is.

## 3. Target user and first use case

Primary user: analysts and marketing or ecommerce managers working on Google BigQuery who currently build dashboards in Looker Studio. Typical questions: why did revenue fall last week, why did average order value rise, why did conversion rate drop, which channel or category caused it. Design the default dimensions, metric examples and wording for ecommerce, while keeping the engine generic.

## 4. Core principles (apply to every decision)

1. Compute with code, narrate with the model. Numbers, rankings and confidence come from SQL and Python.
2. Show your work. Every finding has an Evidence view with the SQL, the comparison window and the checks run.
3. Say "I can't tell" when that is the truth. A calm "no single cause stands out" is a valid result.
4. Separate fact from hypothesis. What changed is fact. Why it might have changed is labelled as a possibility unless an event in the data supports it.
5. The product still works if the language model is unavailable. Charts, drivers and evidence render without it.
6. The model sees aggregated results and schema metadata only. Never send raw rows to it.
7. Zero typing for the main flow. Clicks, not chat.

## 5. Tech stack (use this unless you have a strong reason; explain any change)

- Frontend: Next.js (App Router), TypeScript, Tailwind CSS with design tokens as CSS variables, Chart.js with react-chartjs-2 for charts (element click events, the annotation plugin for highlighted windows, a custom drag handler for brush selection; it draws to canvas, so build the keyboard and screen-reader behaviour from section 13 yourself), Radix primitives for accessible dialogs, menus and popovers. No component library with its own visual identity.
- Backend: Python 3.12, FastAPI, pydantic v2, pandas or polars, scipy and statsforecast for statistics and forecasting.
- Warehouse adapters behind one interface: **BigQuery** (production target) and **DuckDB** (local development, demo mode and the evaluation harness).
- App database: SQLite for local development, Postgres-compatible schema so it can move later.
- Tests: pytest, vitest, Playwright for two or three key flows.
- Local run: one `docker compose up` or documented two-command start. Include a README with setup.

## 6. Warehouse connection

- BigQuery: user uploads a service-account JSON key. Encrypt it at rest (AES-GCM, master key from environment). Instruct users in the UI to create a read-only service account (BigQuery Data Viewer plus Job User). Never echo the key back to the client.
- After connecting: let the user choose project, dataset and tables, then introspect schema, types and row counts, and fetch a few sample rows for preview.
- Guardrails on every query: SELECT only (parse and reject anything else), dry-run first to estimate bytes scanned, enforce a per-query byte cap and timeout from settings, label jobs `whence`, log every query with its cost in an audit table.
- Adapter interface: `introspect()`, `dry_run(sql)`, `run(sql, params)`, `dialect` for SQL generation differences. Everything above the adapter must be warehouse-agnostic.

## 7. Semantic layer: dimensions, metrics and custom calculations

The semantic layer is where definitions live once (for example, "net revenue") so every chart and explanation uses the same logic.

- **Model:** a model points to a table or SQL view and declares a primary time column, plus dimensions and metrics.
- **Dimension:** name, column or SQL expression, type (categorical, time, numeric bucket), optional label. Auto-suggest dimensions from the schema and let the user confirm. Exclude identifiers and very high-cardinality columns from explanation by default, with a visible toggle.
- **Metric:** name, description, numerator expression and aggregation, optional denominator (makes it a ratio metric), optional fixed filter, display format (currency, percent, integer, decimal), and whether higher is better. Examples: Revenue = SUM(price), Orders = COUNT(DISTINCT order\_id), AOV = Revenue / Orders, Conversion rate = Orders / Sessions.
- **Custom metric builder UI:** form with a SQL expression field, live validation by dry run, preview of the last 30 days as a small chart, and clear error messages. Versioned: editing a metric keeps history.
- Metric type decides explanation method (section 8): additive or ratio.
- Identifiers in generated SQL are always validated against the introspected schema and quoted. Values are parameterised.

## 8. The explain engine (the heart of the product)

Build this as a standalone Python package with no web dependencies so it can be tested and evaluated on its own.

### 8.1 Triggers

- Click a data point: compare that period with its baseline.
- Click the chart (or its Explain button): explain the change between the latest complete period and its baseline within the visible range.
- Click two points, or brush a range: compare them.
- Baseline options (default shown, others in a small menu): previous period; same weekday last week; same period last year; trailing average of the last N comparable periods.

### 8.2 Pipeline (run in this order, record each step for the Evidence view)

1. **Resolve.** Metric, time grain, filters and the two windows (current and baseline), aligned by weekday where grain is daily.
2. **Completeness check.** Flag a partial current period (today, missing days, late-arriving data) and warn. Compare like with like or refuse to explain.
3. **Size and noise check.** Compute the change. Compare it with the history of changes of the same grain (the last 26 comparable periods if available, at least 8) using median and MAD, and express it in plain language, for example "larger than 24 of the last 26 weekly changes". If the change is within normal range, say so and lower confidence.
4. **Seasonality check.** Check weekday and, where there is enough history, yearly patterns. If the baseline choice explains most of the change, say that.
5. **Driver search.** For every eligible dimension compute segment contributions (8.3). Rank dimensions by how much of the change a few members explain.
6. **Drill.** Greedy search over two-way combinations of the top three dimensions to find the smallest segment that explains at least 60 percent of the change. Stop at a depth of two.
7. **Data quality scan.** Flag segments that fell to zero or appeared from nothing, null spikes in key columns, row-count discontinuities, and duplicate-row jumps. These often mean a tracking or pipeline problem, and must be labelled as a possible data issue rather than a business cause.
8. **Context events.** If the user has logged events (promotions, price changes, stock-outs, releases, campaign launches), list any that overlap the change window or the top segment, as correlation only.
9. **Confidence.** High: one driver or segment explains at least 50 percent of the change, the change is outside normal range, data is complete, segments exceed the minimum size. Medium: the top three drivers explain at least 60 percent, or one condition above fails. Low: anything else, partial data, or a change within normal volatility. Show the rule that produced the rating.
10. **Evidence object.** Output one structured JSON object (pydantic model) with: windows, headline numbers, ranked drivers (segment, contribution amount, share of change, direction), offsetting effects, checks run with pass or fail, data-quality flags, events, confidence with reason, and the SQL for every finding. Give every finding an id.

### 8.3 Contribution maths

- **Additive metrics** (revenue, orders, units): contribution of segment i is its current value minus its baseline value. Share of change is contribution divided by total change. When the total change is small relative to the gross movement, report offsetting effects (large gains and losses that cancel) instead of dividing by a near-zero total.
- **Ratio metrics** (AOV, conversion rate, margin percent): with segment weights w (share of the denominator) and segment rates r, use the exact two-point split. Rate effect of segment i = average weight × change in rate. Mix effect of segment i = change in weight × (average rate of segment i minus the average overall rate). Report rate and mix separately, because "customers shifted to a cheaper category" and "prices fell inside every category" are different stories.
- Respect minimum segment size. Do not credit a segment with a large share of change on a handful of rows. Mark such segments as low support.

### 8.4 Narrative step

The language model receives only the Evidence object and the metric definitions. Rules:

- Write a headline sentence, two to four short supporting sentences, and caveats.
- Every number must appear in the Evidence object. After generation, run a **number check**: extract all figures from the text and verify each exists in the evidence (allowing formatting and rounding). On failure, retry once, then fall back to a templated sentence built from the evidence.
- Label hypotheses as possibilities. Never state a cause that is not in the evidence. If confidence is Low, say that no single cause stands out and describe what changed.
- Plain, specific language. No hype words, no exclamation marks, no emoji.

## 9. LLM integration

- Provider-agnostic client behind one interface. Settings via environment: `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, optional `LLM_BASE_URL`. The values will be given later, so keep the code free of any specific model name.
- Three model tasks only: (a) turn a dashboard request into a validated dashboard spec (section 10), (b) write the narrative from evidence (section 8.4), (c) suggest names and descriptions for metrics and dimensions from the schema.
- Structured outputs validated against pydantic schemas. Low temperature. Retry with the validation error on failure. Prompts live in versioned files under `prompts/`, not inline.
- Log token usage and latency per call. Enforce a per-workspace daily limit from settings.

## 10. Dashboard generation and editing

- The user describes the dashboard in one text box and, optionally, picks a model. The model returns a **JSON dashboard spec**, never SQL or code: a list of charts, each with metric, dimensions, time grain, date range, filters, chart type, title and layout position.
- Validate the spec against the semantic layer. Unknown metrics or fields are rejected and sent back to the model once.
- A deterministic **query compiler** turns each chart spec into SQL for the adapter's dialect. The SQL is visible on every chart.
- Chart types in v1: line, bar (vertical and horizontal), stacked bar, area, KPI tile with comparison, table, scatter. A pie or donut is allowed only for four or fewer parts.
- Dashboard-level filters (date range, any dimension) apply to every chart.
- **Editing:** selecting a chart opens an edit panel with metric, breakdown, time grain, date range, filters, chart type, title and number format. Changes re-run the query. Layout is a drag-and-resize grid. Undo and redo. Each chart has a duplicate and delete action.

## 11. One-click actions on every chart

A small toolbar appears on hover and on keyboard focus of a chart, with: **Explain**, **Forecast**, **Compare**, **Anomalies**, **Edit**, **SQL**, **Fullscreen**.

- **Explain:** section 8.
- **Forecast:** use statsforecast (AutoETS, with seasonal naive as the benchmark) on the chart's series. Choose a horizon by grain (for example 14 days, 8 weeks, 6 months). Show the forecast line with an 80 percent interval, and show a backtest on a hold-out window with its error. Refuse with a clear message when there are fewer than about 2.5 seasonal cycles of history. The model writes at most two sentences and may only restate figures from the forecast result.
- **Compare:** two windows side by side with the change broken down by the chart's dimensions, using the same contribution maths.
- **Anomalies:** flag points outside the expected band using the seasonal baseline, mark them on the chart, and let the user click a flagged point to Explain it.
- Never auto-run on page load. Every analysis starts from a user click and shows progress steps.

## 12. Explanation UI

An **Explain dialog** opens centred over the page as a modal dialog (about 960 px wide, at most 85 percent of the viewport height, scrolling inside) and holds a small copy of the chart with the compared windows highlighted. Esc or a click on the overlay closes it. Focus stays inside while it is open and returns to the clicked point on close. Below 768 px it becomes a full-screen sheet.

- Header: the headline sentence, then a confidence label with its reason on hover or tap.
- A **driver waterfall** (horizontal bars from baseline to current, drivers in order) and a ranked list with contribution amount and share of change, laid out beside the small chart copy.
- Tabs: **Summary**, **Evidence** (windows, checks run, SQL per finding with copy button, query cost), **Data checks** (quality flags and events).
- Each driver has **Drill in** (re-runs Explain scoped to that segment, inside the dialog, with a breadcrumb trail so the user can step back) and **Show on chart** (highlights the segment).
- Actions: **Pin to dashboard** (saves the explanation as a note under the chart), **Copy as text**, **Share link** (Phase 4).
- Progress while running is a list of real steps, each ticked when done: "Comparing 11 Nov with 4 Nov", "Checking 7 dimensions", "Looking for data issues", "Verifying figures". No generic spinner or sparkle animation.
- A small, secondary **Ask a follow-up** field is allowed in Phase 3 for questions about the current explanation. It is not the main interaction and must not look like a chatbot.

## 13. Design direction — no generic AI-product look

The interface should feel like a precise analytical tool from a well-run editorial team: calm, dense where data needs it, quiet everywhere else.

**Do not do any of the following:** purple, indigo or blue-violet gradients; glassmorphism or frosted panels; glowing borders or neon; sparkle (✨) icons or "AI" badges; gradient text; emoji as icons or in copy; floating chat bubbles; oversized rounded cards with heavy drop shadows; centred hero sections with abstract blobs; stock illustrations; bounce or spring animations; confetti; rainbow chart palettes; 3D charts; skeleton screens that do not match the final layout; marketing words such as "unlock", "supercharge", "seamless", "powerful insights"; "Welcome back 👋" greetings.

**Foundations**

- Tokens as CSS variables, light mode first, dark mode built from the same tokens. Use the Radix Colors scales (`@radix-ui/colors`): the `slate` scale for neutrals (steps 1 to 2 for backgrounds, 3 to 5 for component backgrounds, 6 to 8 for borders, 11 to 12 for text) and the `blue` scale for the single accent (step 9 for solid fills, step 11 for text), each with its dark counterpart. Increase and decrease use the Radix `green` and `red` scales for text, always paired with a sign or arrow so colour is never the only signal. Measure WCAG AA contrast for every text and background pair in both modes and fix any that fail.
- Chart palette (the Tableau 10 set, in order): `#4E79A7`, `#F28E2B`, `#E15759`, `#76B7B2`, `#59A14F`, `#EDC948`, `#B07AA1`, `#FF9DA7`, `#9C755F`, `#BAB0AC`. Use one colour by default and add colours only when there is a breakdown. Driver waterfall bars use only `#59A14F` for increases and `#E15759` for decreases, never mixed with series colours in the same view.
- Type: **Newsreader** for the wordmark and large headings, **Instrument Sans** for UI text, **JetBrains Mono** for SQL and code. Numbers use tabular figures. Self-host the fonts. Scale: 12, 13, 14, 16, 20, 28, 36 px.
- Spacing on an 8 px grid. Borders are 1 px hairlines instead of shadows. Corner radius 4 to 6 px. One subtle shadow only for popovers and dialogs.
- Wordmark: lowercase "whence" in Newsreader, no icon needed.

**Layout**

- Narrow left rail (about 56 px collapsed, 220 px expanded) with: Dashboards, Data (models, dimensions, metrics), Events, Settings. Top bar with dashboard title, global filters and date range.
- 12-column canvas grid with 16 px gaps. Charts sit on the surface with a hairline border, a plain title in the heading style, a muted subtitle (metric definition and filters), and the toolbar on hover.
- Desktop first, fully usable on tablet. On a phone dashboards are read-only and Explain still works.

**Charts**

- Minimal gridlines, direct labels where possible, axis labels in muted text, no chart borders or backgrounds inside the card. Zero baseline for bars. Tooltips show exact values with the metric's format and the comparison to the baseline.
- The clickable affordance is obvious: pointer cursor on data points, a visible hover state, a clear selected state, and a one-line hint "Click a point to see why" on the first dashboard only.
- Keyboard: charts are focusable, arrow keys move between points, Enter runs Explain. Provide a data-table view for screen readers.

**Motion and states**

- Transitions 120 to 200 ms, ease-out, opacity and transform only. Respect `prefers-reduced-motion`.
- Loading uses skeletons that match each component's real layout. Empty states say what to do next in one sentence with one button. Errors name the problem and the fix, for example "This query would scan 41 GB, above your 10 GB limit. Narrow the date range or raise the limit in Settings."

**Copy**

Plain, specific and short. Sentence case. No exclamation marks. Say "metric", "breakdown" and "period", not invented terms.

**Accessibility**

WCAG AA contrast, visible focus rings, all controls operable by keyboard, labels on every input, no information conveyed by colour alone.

## 14. Phases and acceptance criteria

### Phase 0 — Scaffold and design system

Repository, tooling, CI-style scripts, both adapters stubbed, design tokens, base components (button, input, select, tabs, dialog, popover, toast, skeleton), app shell with left rail, a Dashboards home page with a clear empty state (no phase or build-status text anywhere in the product), and a developer-only style page at /dev/style (served only outside production or when ENABLE\_STYLE\_GUIDE is true, and never linked from the product) showing every token and component in light and dark, plus one real Chart.js line chart and a sample driver waterfall. **Done when** it runs locally from the README and the style page passes the section 13 checklist.

### Phase 1 — Prove the explanation (most important)

1. DuckDB and BigQuery adapters with introspection, dry run, guardrails and audit log.
2. Semantic layer with dimensions and additive and ratio metrics (API and simple form UI).
3. Query compiler for the chart types above.
4. The full explain engine from section 8 as a standalone package, with unit tests.
5. A fixed demo dashboard of five charts (revenue over time, revenue by category, orders by state, average order value over time, orders by payment type) on the generated or public ecommerce dataset, with click-to-explain on charts and points and the Explain dialog (sections 11 and 12).
6. LLM narrative step with the number check and the no-model fallback.
7. **Evaluation harness** (section 15).

**Done when** `eval` runs end to end and reports accuracy, the demo dashboard explains correctly on planted causes, and the report lists failures honestly.

### Phase 2 — Generate and edit

Prompt-to-dashboard via the JSON spec, chart edit panel, drag-and-resize layout, dashboard filters, custom metric builder with validation and versioning, dashboard save and load.

### Phase 3 — Forecast, compare, anomalies, context

Forecast with backtest, Compare, Anomaly scan, events log (manual entry and CSV import) feeding the engine, optional follow-up field, pinned explanations.

### Phase 4 — Hardening

Authentication and workspaces, sharing links, role basics (viewer, editor), encrypted credential rotation, rate limits, error monitoring, production deployment notes, Playwright flows for connect, build, explain.

## 15. Evaluation harness (build in Phase 1)

The purpose is to measure whether the explanations are right, not to demonstrate that they look good.

- A script generates a realistic ecommerce dataset (orders, items, categories, states, payment types, sessions, prices) with seasonality, weekday patterns and noise, in DuckDB. Optionally a second run uses the public BigQuery `thelook_ecommerce` dataset.
- A scenario file plants known causes into copies of the data, each with an expected result. Include at least these twelve: (1) one category's orders drop 40 percent for a week; (2) one state spikes; (3) a discount day raises units and lowers AOV; (4) a tracking break sends one source's sessions to zero; (5) a mix shift to a cheaper category lowers AOV with no price change; (6) prices fall inside every category; (7) two causes overlap, one large and one small; (8) a normal weekday dip that should not be flagged; (9) an incomplete current day; (10) a control period with only noise; (11) a segment with very few rows that spikes (should be low support); (12) offsetting gains and losses that cancel.
- `npm run eval` (or `make eval`) runs every scenario through the engine and prints: top-1 and top-3 driver hit rate, false-positive rate on the no-change and noise scenarios, correct handling of partial data, calibration (how often High confidence was right), and the number-check pass rate for narratives. Save results to a dated JSON file and a readable table.
- Treat the scenarios as regression tests. Any engine change must keep or improve the scores, and the report must show before and after.

## 16. Data model and API (minimum)

- Tables: workspaces, users (Phase 4), connections (encrypted credentials), models, dimensions, metrics, metric\_versions, dashboards, charts, explanations (stored evidence and narrative), events, query\_audit, llm\_usage.
- Endpoints (REST, JSON, versioned under `/api/v1`): connections (create, test, introspect), models, dimensions, metrics (CRUD plus validate and preview), dashboards and charts (CRUD, run), `POST /charts/{id}/explain`, `/forecast`, `/compare`, `/anomalies`, `POST /dashboards/generate`, events (CRUD plus CSV import), settings.
- Long analyses stream step events to the client (server-sent events) so the progress list in section 12 is real.

## 17. Security

- Secrets only from the environment or encrypted storage. Nothing sensitive reaches the browser.
- All SQL is generated by the compiler from validated identifiers, with parameterised values. User-supplied metric expressions are checked by parsing and dry run, SELECT-only, with no statements that write, call external functions or access other datasets.
- Aggregated results only go to the language model. Provide a setting that further limits segment labels sent to it.
- Rate-limit API routes. Log security-relevant events. Validate and size-limit file uploads.

## 18. Out of scope for now

Chat-first interface, scheduled reports and alerts, embedded analytics, warehouses beyond BigQuery and DuckDB, a native mobile app, billing, white-labelling.

## 19. What to include in each phase report

What was built, how to run it, what you tested and the results, what you did not test, assumptions you made, deviations from this brief with reasons, known issues, and the proposed next step. Include screenshots of the main screens for any UI work, in light and dark mode.

## 20. Engineering process (full SDLC)

Every change goes through the eight stages below, and its size sets how much paper each stage needs. **Small** (a bug fix, copy, one function): ticket, failing test, fix, review. **Medium** (one feature or item): every stage with a short artifact. **Large** (a phase): every stage with full artifacts and my approval at the gates marked ◆. Never skip a stage; shrink its artifact instead.

| Stage | What happens | Artifact in the repo | Exit gate |
| --- | --- | --- | --- |
| 1. Requirements | Interview me with /grill-me. Write user stories with acceptance criteria, non-goals and non-functional needs (security, performance, accessibility, cost). | docs/specs/NNN-name.md (/to-spec) | ◆ I approve the spec |
| 2. Design | Describe components, data model and API changes. For anything touching credentials, SQL, the model prompt or user data, add a short threat model. Record hard-to-reverse decisions as ADRs. | Design section in the spec; docs/adr/NNNN-title.md | ◆ I approve (Medium and Large) |
| 3. Planning | Split the work into thin vertical slices, each with acceptance criteria, test notes, dependencies and a size. List the risks. | docs/tickets/NNN-name.md (/to-tickets) | ◆ I approve the ticket list |
| 4. Build | One local branch per ticket. Failing test first (/tdd), small commits with conventional messages, versioned database migrations. | Branch, tests, code | Tests pass |
| 5. Verify | Unit, integration and end-to-end (Playwright) tests; the eval harness for any engine change; accessibility checks and light and dark screenshots for UI; dependency audit, secret scan and SQL-guard tests; a numbered manual test script for anything that needs live BigQuery. | docs/test-plans/NNN-name.md; CI output | Every check green |
| 6. Review | /code-review against the standards and the spec, a security pass for sensitive changes, and a self-review checklist in the ticket. | Review notes in the ticket | No open blockers |
| 7. Release | Semantic version, CHANGELOG entry, release notes, migration tested on a copy of the previous database, rollback plan. Tag locally. | CHANGELOG.md; docs/releases/vX.Y.Z.md | ◆ I approve any push or deploy |
| 8. Operate | Structured logs, error reporting, health checks, backups of the app database, dependency updates. Bugs go through /diagnose, get a regression test before the fix, and a short note. | docs/runbook.md; docs/incidents/ | Runbook current |

### Definition of ready (a ticket)

A linked spec, acceptance criteria written as checkable statements, test notes, dependencies and a size.

### Definition of done

- Every acceptance criterion is demonstrated and maps to at least one named test.
- Tests were written first and pass. Lint, type checks, tests and build are green.
- For engine changes, npm run eval is the same or better, with before and after shown.
- No new high or critical findings from the dependency audit or the secret scan.
- Docs, PROGRESS.md and the ticket are updated, and UI changes have light and dark screenshots.
- Migrations are tested up and down on a copy of the data.
- The code is reviewed, and I have approved wherever ◆ appears.

### Standards

- Trunk-based: main is always releasable, branches are short-lived, and nothing is committed directly to main. Commit locally only. Never push, merge or deploy without my approval.
- Scope changes go back to the spec. Anything found mid-ticket becomes a new ticket.
- Database changes use versioned migrations. If tables are still created ad hoc in code, introduce a migration tool first.
- Configuration comes from typed environment settings documented in .env.example. Dependencies are pinned with lock files and audited. Secrets are never committed, and a secret scanner runs in CI and before commits.
- Logs are structured and never contain keys, private data or raw rows.
- Record performance budgets (dashboard first render, Explain time) and cost limits (byte cap, daily model limit), and check them in the Verify stage.
- Write an ADR for hard-to-reverse decisions: libraries, data model, hosting, model provider.
- Hosting is undecided. Until I decide, a release means a tagged local build that runs from docker compose.

### Security and privacy review

For every Medium or Large change, check SQL injection and the table allowlist, credential handling, prompt injection from data into the model, what data reaches the model (aggregates only), and what is logged. Record the result in the ticket.

### Traceability and reporting

Spec criteria lead to tickets, tickets to tests, and tests to PROGRESS.md. Each phase report lists any criterion without a test. Use the section 19 template for every ticket and phase report, and add the ADRs written, the risks still open and any deviations from the spec.
