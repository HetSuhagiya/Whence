# Ticket 003: Chart Look (Replace Tableau Default)

## Metadata
- **Workstream**: 3 (Chart Look)
- **Size**: Medium
- **Dependencies**: Ticket 001, Ticket 002
- **Spec Reference**: Spec 002 (AC 3.1 - 3.8)

## Problem & Context
The current chart presentation uses standard Tableau 10 colors and heavy card boxes that look generic. The product needs an authoritative, editorial visualization aesthetic with Paul Tol muted color palettes, headline delta badges, hairline rules, and persistent explained point highlights.

## Acceptance Criteria
1. **Palette Tokens**:
   - Main series: Ink (`slate12` / `#111827` light, `#F9FAFB` dark).
   - Baseline: `slate8` (`#889096`).
   - Highlight: `blue9` (`#0090FF`).
   - Paul Tol muted scheme (10 ordered colors): `#332288`, `#88CCEE`, `#44AA99`, `#117733`, `#999933`, `#DDCC77`, `#CC6677`, `#882255`, `#AA4499`, `#DDDDDD`.
   - Waterfall: Radix `green9` (`#30A46C` increase) and Radix `red9` (`#E54D2E` decrease).
   - Contrast check: All graphical lines and bars verified $\ge 3:1$ against background in light and dark mode.
2. **Time Series Styling**:
   - 2px stroke, round line joins, zero point markers until hover.
   - Faint dashed line behind representing previous-period comparison data.
   - Direct end-of-line series label instead of top legends.
   - Flat background without gradients or excessive area fill.
3. **Axes**:
   - Outer chart border removed.
   - Exactly 3 horizontal hairline gridlines (bottom, mid, top).
   - 12px Instrument Sans muted ticks with tabular numerals (`font-variant-numeric: tabular-nums`).
4. **Bars**:
   - Flat fills, 2px corner radius only at data tips.
   - Formatted value labels at bar tips when space allows.
   - Category breakdowns sorted descending by value.
5. **Card Layout & Typography**:
   - Boxed card borders dropped in favor of clean hairline separators.
   - Header shows large headline metric number with period-over-period delta badge (with directional sign and arrow $\uparrow$ / $\downarrow$).
   - Chart title rendered in Newsreader serif; subtitle in muted Instrument Sans.
   - First chart spans full width (hero); remaining charts format in a two-column grid.
6. **Tooltips**:
   - Custom HTML tooltip rendering metric value, delta vs previous period, and `"Click to explain"` prompt.
7. **Explained Point Persistence**:
   - Once Explain is triggered on a point, a persistent marker ring remains on the chart for the rest of the user session.
8. **Accessibility**:
   - Full keyboard navigation (arrow keys across points, Enter to explain), accessible table toggle, and reduced motion respected.

## Technical Tasks
- **Frontend**:
  - Update `frontend/src/styles/tokens.css` with Paul Tol muted scheme and ink series tokens.
  - Refactor `frontend/src/components/dashboard/ChartCard.tsx`:
    - Implement hairline separator layout with headline number and period delta badge.
    - Title in Newsreader serif font.
    - Chart.js configuration overhaul: 3-line horizontal grid, hidden y/x borders, end-of-line direct label plugin.
    - Previous period faint dashed dataset overlay.
    - Custom HTML tooltip plugin with delta and "Click to explain".
    - Session state tracking `explainedPoints` rendering persistent point rings.
  - Update `frontend/src/components/dashboard/ExplainWaterfall.tsx` with Radix `green9` and `red9`.
  - Contrast calculation script verifying $\ge 3:1$ across light and dark modes.

## Test Plan & Verification
- Unit and snapshot tests in `frontend/src/tests/chart_styling.test.tsx`.
- Contrast audit reporting exact contrast ratios for all tokens.
- Light and dark mode screenshots capturing hero chart, 2-column grid, dashed previous-period line, and explained point ring.
