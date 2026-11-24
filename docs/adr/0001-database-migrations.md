# ADR 0001: Database Migrations with Alembic

- **Status:** Accepted
- **Date:** 2026-11-24
- **Deciders:** Whence Engineering Team
- **Consulted:** SDLC Section 20 Guidelines

---

## Context

Whence currently maintains its application metadata (connections, sources, semantic models, dimensions, metrics, metric versions, dashboards, and dashboard charts) in a SQLite database configured via `backend/app/db.py`.

Previously, tables were initialized via raw SQL `CREATE TABLE IF NOT EXISTS` execution on startup, and column alterations were attempted via ad-hoc `ALTER TABLE ... ADD COLUMN` try/except loops. This approach presents multiple critical limitations:
1. **SDLC Standards Non-compliance:** The Whence SDLC (Section 20) explicitly mandates: *"Database changes use versioned migrations. If tables are still created ad hoc in code, introduce a migration tool first"* and *"Migrations are tested up and down on a copy of the data."*
2. **Schema Drift and Lack of Rollbacks:** Ad-hoc scripts cannot roll back (downgrade) schema modifications, track applied versions, or reproduce past database states deterministically.
3. **Multi-Dialect Compatibility (SQLite & PostgreSQL):** While local development and embedded tests rely on SQLite, production environments and future cloud deployments may target PostgreSQL. Raw DDL strings with database-specific syntax (especially altering tables and column types) do not port cleanly across database dialects.
4. **Automated Migration in Local/CI Environments:** Developers and test environments need an automatic, programmatic migration runner so that running tests or starting the backend server seamlessly applies any pending schema revisions without manual CLI interventions.

## Decision

We adopt **Alembic** as the database migration tool for Whence.

Key design decisions:
1. **Alembic Directory Structure:**
   - Alembic configuration located at `backend/alembic.ini`.
   - Migration scripts located in `backend/alembic/versions/`.
   - Migration environment located at `backend/alembic/env.py`.
2. **Dialect Support & Batch Mode:**
   - Configure `render_as_batch=True` for SQLite compatibility in `env.py`. SQLite has limited support for `ALTER TABLE` statements (such as dropping or altering columns); Alembic's batch mode uses a table copy-and-swap strategy to support full up/down migrations transparently on SQLite while generating standard DDL on PostgreSQL.
3. **Reversible Migrations:**
   - All migration revisions must implement both `upgrade()` and `downgrade()` functions.
4. **Baseline Initial Migration:**
   - The initial migration (`0001_initial_schema.py`) defines all existing tables (`connections`, `connection_sources`, `models`, `dimensions`, `metrics`, `metric_versions`, `dashboards`, and `dashboard_charts`) including foreign keys and indexes.
5. **Programmatic Startup Runner:**
   - Implement `run_migrations()` in `backend/app/db.py` using Alembic's programmatic API (`alembic.command.upgrade(alembic_cfg, "head")`).
   - When the backend initializes via `init_db()`, `run_migrations()` is invoked automatically to guarantee that all pending revisions are applied before request serving begins.

## Consequences

### Positive
- **Determinism & History:** Every schema change is explicitly tracked, version-controlled, and audited in the repository.
- **Up/Down Reversibility:** Migrations can be applied forward and backward, supporting rollback testing during release procedures.
- **Cross-Engine Portability:** Standard Alembic / SQLAlchemy DDL abstraction allows seamless migration to PostgreSQL in future production deployments without rewriting schema operations.
- **Developer Experience:** New team members, CI test suites, and Docker containers automatically apply migrations on launch without manual intervention.

### Trade-offs & Mitigations
- **Dependencies:** Introduces `alembic` and `sqlalchemy` to `backend/requirements.txt`. Mitigated by keeping their usage focused on migration management and DDL operations.
- **SQLite Limitations:** Altering foreign keys or dropping columns in SQLite requires batch mode (`render_as_batch=True`), which is enabled by default in our Alembic configuration.
- **Process Discipline:** Developers must write migration scripts for all database schema changes rather than editing ad-hoc raw SQL strings.
