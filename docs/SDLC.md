# Software Development Life Cycle (SDLC)

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

## Definition of ready (a ticket)

A linked spec, acceptance criteria written as checkable statements, test notes, dependencies and a size.

## Definition of done

- Every acceptance criterion is demonstrated and maps to at least one named test.
- Tests were written first and pass. Lint, type checks, tests and build are green.
- For engine changes, npm run eval is the same or better, with before and after shown.
- No new high or critical findings from the dependency audit or the secret scan.
- Docs, PROGRESS.md and the ticket are updated, and UI changes have light and dark screenshots.
- Migrations are tested up and down on a copy of the data.
- The code is reviewed, and I have approved wherever ◆ appears.

## Standards

- Trunk-based: main is always releasable, branches are short-lived, and nothing is committed directly to main. Commit locally only. Never push, merge or deploy without my approval.
- Scope changes go back to the spec. Anything found mid-ticket becomes a new ticket.
- Database changes use versioned migrations. If tables are still created ad hoc in code, introduce a migration tool first.
- Configuration comes from typed environment settings documented in .env.example. Dependencies are pinned with lock files and audited. Secrets are never committed, and a secret scanner runs in CI and before commits.
- Logs are structured and never contain keys, private data or raw rows.
- Record performance budgets (dashboard first render, Explain time) and cost limits (byte cap, daily model limit), and check them in the Verify stage.
- Write an ADR for hard-to-reverse decisions: libraries, data model, hosting, model provider.
- Hosting is undecided. Until I decide, a release means a tagged local build that runs from docker compose.

## Security and privacy review

For every Medium or Large change, check SQL injection and the table allowlist, credential handling, prompt injection from data into the model, what data reaches the model (aggregates only), and what is logged. Record the result in the ticket.

## Traceability and reporting

Spec criteria lead to tickets, tickets to tests, and tests to PROGRESS.md. Each phase report lists any criterion without a test. Use the section 19 template for every ticket and phase report, and add the ADRs written, the risks still open and any deviations from the spec.
