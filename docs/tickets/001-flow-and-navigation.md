# Ticket 001: Flow and Navigation

## Metadata
- **Workstream**: 1 (Flow and Navigation)
- **Size**: Medium
- **Dependencies**: None
- **Spec Reference**: Spec 002 (AC 1.1 - 1.5)

## Problem & Context
The current data workspace separates connections and semantic models into disconnected tabs, requiring users to manually navigate back and forth and remember which step comes next. Deleting a model can silently break existing dashboards.

## Acceptance Criteria
1. **Top Step Indicator**: A persistent 4-step progress header (`Connect` $\to$ `Choose data` $\to$ `Model` $\to$ `Dashboard`) on `/data` showing `done`, `current`, and `blocked` states with plain-language status reasons.
2. **Auto-advance to Model**: Saving or confirming a connection immediately transitions the view to the `Model` tab with that connection preselected.
3. **Primary Action on Model**: `"Create dashboard from this data"` button positioned prominently on the Model page, disabled with clear helper text until model is confirmed. Clicking it opens the Create Dashboard dialog prefilled, creates the dashboard, and navigates directly to `/dashboards/[id]`.
4. **Contextual Action Buttons**:
   - Connection cards on `/data` display a single next action button (`"Choose tables"` or `"Define model"`).
   - Home dashboard empty state displays `"Connect your warehouse"`.
   - Dashboard views display an `"Edit data definitions"` button linking back to `/data?tab=model&connection_id=...`.
5. **Dependency Warning**: Deleting or changing a model checks dependent dashboards/charts via `GET /api/v1/semantic/models/{id}/dependents`, prompting with a warning dialog listing affected charts by title.

## Technical Tasks
- **Backend**:
  - Implement `GET /api/v1/semantic/models/{id}/dependents` in `backend/app/semantic/router.py` returning `{ "dashboard_count": int, "dashboards": list[dict], "chart_count": int, "charts": list[dict] }`.
- **Frontend**:
  - Create `frontend/src/components/navigation/StepIndicator.tsx`.
  - Update `frontend/src/app/data/page.tsx` with unified state tracking and auto-advance on connection save.
  - Add `"Create dashboard from this data"` button and link to `CreateDashboardDialog`.
  - Add `"Edit data definitions"` shortcut in `frontend/src/app/dashboards/[id]/page.tsx`.
  - Add dependency check modal before model deletion in `frontend/src/components/semantic/SemanticLayerManager.tsx`.

## Test Plan & Verification
- Unit/Component tests in `frontend/src/tests/navigation_flow.test.tsx` verifying step states, auto-advance, and dependency warning dialog.
- Backend tests in `backend/tests/test_model_dependents.py`.
- Playwright happy-path verification of end-to-end traversal from Step 1 to Step 4.
