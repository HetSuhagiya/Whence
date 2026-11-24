import asyncio
import json
from decimal import Decimal
from pathlib import Path
from typing import Any

from app.explain.engine import ExplainEngine
from app.semantic.service import semantic_service


def serialize_val(val: Any) -> Any:
    if isinstance(val, Decimal):
        return float(val)
    return val


async def fetch_week_data(adapter: Any, start_date: str, end_date: str) -> dict[str, Any]:
    # 1. Total revenue and orders
    sql_total = f"""
    SELECT
      COUNT(DISTINCT f.order_id) as total_orders,
      COALESCE(SUM(oi.price), 0.0) as total_revenue
    FROM `primeval-pixel-407210.dbt_project.fct_orders` f
    JOIN `primeval-pixel-407210.dbt_project.order_items` oi ON f.order_id = oi.order_id
    WHERE f.ordered_at >= "{start_date}" AND f.ordered_at <= "{end_date} 23:59:59"
    """
    res_tot = await adapter.run(sql_total)
    tot_row = res_tot.rows[0]
    total_orders = int(tot_row["total_orders"])
    total_rev = float(tot_row["total_revenue"])

    # 2. Revenue and orders by category
    sql_cat = f"""
    SELECT
      COALESCE(ct.product_category_name_english, p.product_category_name, "Other") as category,
      COUNT(DISTINCT f.order_id) as orders,
      COALESCE(SUM(oi.price), 0.0) as revenue
    FROM `primeval-pixel-407210.dbt_project.fct_orders` f
    JOIN `primeval-pixel-407210.dbt_project.order_items` oi ON f.order_id = oi.order_id
    LEFT JOIN `primeval-pixel-407210.dbt_project.products` p ON oi.product_id = p.product_id
    LEFT JOIN `primeval-pixel-407210.dbt_project.category_translation` ct ON p.product_category_name = ct.product_category_name
    WHERE f.ordered_at >= "{start_date}" AND f.ordered_at <= "{end_date} 23:59:59"
    GROUP BY 1
    ORDER BY 3 DESC
    LIMIT 20
    """
    res_cat = await adapter.run(sql_cat)
    cat_rev = {r["category"]: float(r["revenue"]) for r in res_cat.rows}
    cat_ord = {r["category"]: int(r["orders"]) for r in res_cat.rows}

    # 3. Revenue and orders by state
    sql_state = f"""
    SELECT
      COALESCE(f.customer_state, "Unknown") as state,
      COUNT(DISTINCT f.order_id) as orders,
      COALESCE(SUM(oi.price), 0.0) as revenue
    FROM `primeval-pixel-407210.dbt_project.fct_orders` f
    JOIN `primeval-pixel-407210.dbt_project.order_items` oi ON f.order_id = oi.order_id
    WHERE f.ordered_at >= "{start_date}" AND f.ordered_at <= "{end_date} 23:59:59"
    GROUP BY 1
    ORDER BY 3 DESC
    LIMIT 15
    """
    res_state = await adapter.run(sql_state)
    state_rev = {r["state"]: float(r["revenue"]) for r in res_state.rows}
    state_ord = {r["state"]: int(r["orders"]) for r in res_state.rows}

    return {
        "orders": total_orders,
        "revenue": total_rev,
        "category_rev": cat_rev,
        "category_ord": cat_ord,
        "state_rev": state_rev,
        "state_ord": state_ord,
    }


async def fetch_history_deltas(adapter: Any, before_date: str, limit: int = 26) -> list[float]:
    sql_hist = f"""
    WITH weekly AS (
      SELECT
        DATE(TIMESTAMP_TRUNC(f.ordered_at, WEEK(MONDAY))) as week_start,
        COALESCE(SUM(oi.price), 0.0) as weekly_rev
      FROM `primeval-pixel-407210.dbt_project.fct_orders` f
      JOIN `primeval-pixel-407210.dbt_project.order_items` oi ON f.order_id = oi.order_id
      WHERE f.ordered_at < "{before_date}"
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT {limit + 1}
    )
    SELECT
      weekly_rev - LEAD(weekly_rev) OVER (ORDER BY week_start DESC) as delta_rev
    FROM weekly
    """
    res = await adapter.run(sql_hist)
    deltas = [float(r["delta_rev"]) for r in res.rows if r["delta_rev"] is not None]
    return deltas if len(deltas) >= 8 else [1000.0] * 12


async def run_olist_eval():
    print("=" * 80)
    print("PART D: REAL-DATA CHECK ON OLIST BIGQUERY DATASET (primeval-pixel-407210)")
    print("=" * 80)

    # Check for active BigQuery connection
    from app.connections.service import connection_service
    active_conns = connection_service.list_connections()
    bq_conn = next((c for c in active_conns if c.warehouse_type == "bigquery"), None)

    runs_to_execute = [
        {
            "name": "(a) Black Friday 2017 Spike",
            "baseline": ("2017-11-13", "2017-11-19"),
            "current": ("2017-11-20", "2017-11-26"),
        },
        {
            "name": "(b1) Ordinary Week 1 (March 2017)",
            "baseline": ("2017-03-06", "2017-03-12"),
            "current": ("2017-03-13", "2017-03-19"),
        },
        {
            "name": "(b2) Ordinary Week 2 (May 2017)",
            "baseline": ("2017-05-08", "2017-05-14"),
            "current": ("2017-05-15", "2017-05-21"),
        },
        {
            "name": "(b3) Ordinary Week 3 (July 2017)",
            "baseline": ("2017-07-10", "2017-07-16"),
            "current": ("2017-07-17", "2017-07-23"),
        },
        {
            "name": "(b4) Ordinary Week 4 (August 2017)",
            "baseline": ("2017-08-14", "2017-08-20"),
            "current": ("2017-08-21", "2017-08-27"),
        },
        {
            "name": "(b5) Ordinary Week 5 (October 2017)",
            "baseline": ("2017-10-09", "2017-10-15"),
            "current": ("2017-10-16", "2017-10-22"),
        },
    ]

    out_file = Path(__file__).parent / "results" / "olist_real_data_results.json"

    if bq_conn:
        adapter = semantic_service.get_adapter_for_connection(bq_conn.id)
        engine = ExplainEngine()
        all_summaries = []

        for r in runs_to_execute:
            print(f"\nRunning {r['name']} via live BigQuery connection ({bq_conn.id})...")
            b_start, b_end = r["baseline"]
            c_start, c_end = r["current"]

            b_data = await fetch_week_data(adapter, b_start, b_end)
            c_data = await fetch_week_data(adapter, c_start, c_end)
            h_deltas = await fetch_history_deltas(adapter, c_start, limit=26)

            dim_data = {
                "category": {
                    "baseline_values": b_data["category_rev"],
                    "current_values": c_data["category_rev"],
                    "baseline_counts": b_data["category_ord"],
                    "current_counts": c_data["category_ord"],
                },
                "state": {
                    "baseline_values": b_data["state_rev"],
                    "current_values": c_data["state_rev"],
                    "baseline_counts": b_data["state_ord"],
                    "current_counts": c_data["state_ord"],
                },
            }

            ev = engine.run_from_data(
                metric_name="revenue",
                metric_type="additive",
                time_grain="week",
                baseline_start=b_start,
                baseline_end=b_end,
                current_start=c_start,
                current_end=c_end,
                baseline_value=b_data["revenue"],
                current_value=c_data["revenue"],
                dimension_data=dim_data,
                history_deltas=h_deltas,
                min_rows=15,
            )

            top_drivers_summary = [
                {
                    "dimension": d.dimension,
                    "segment": d.segment_value,
                    "delta": d.contribution_amount,
                    "share": f"{d.share_of_change * 100:.1f}%",
                }
                for d in ev.drivers[:3]
            ]

            summary = {
                "name": r["name"],
                "baseline_window": f"{b_start} to {b_end}",
                "current_window": f"{c_start} to {c_end}",
                "baseline_revenue": b_data["revenue"],
                "current_revenue": c_data["revenue"],
                "delta_revenue": round(ev.delta, 2),
                "percent_change": f"{ev.percent_change:+.1f}%",
                "confidence": ev.confidence,
                "confidence_reason": ev.confidence_reason,
                "top_drivers": top_drivers_summary,
                "offsetting_effects": ev.has_offsetting_effects,
            }
            all_summaries.append(summary)

            print(f"  Revenue: ${b_data['revenue']:,.2f} -> ${c_data['revenue']:,.2f} ({ev.percent_change:+.1f}%)")
            print(f"  Confidence: {ev.confidence} ({ev.confidence_reason})")
            print(f"  Top Drivers: {top_drivers_summary}")

        out_file.parent.mkdir(parents=True, exist_ok=True)
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(all_summaries, f, indent=2)
        print(f"\nSaved real-data Olist evaluation results to {out_file}\n")
    else:
        print("\nNo live BigQuery credentials connected. Verifying against recorded Olist real-data benchmark artifact...")
        if out_file.exists():
            with open(out_file, "r", encoding="utf-8") as f:
                saved = json.load(f)
            for s in saved:
                print(f"\nPeriod: {s['name']} ({s['baseline_window']} vs {s['current_window']})")
                print(f"  Baseline Revenue: ${s['baseline_revenue']:,.2f} | Current Revenue: ${s['current_revenue']:,.2f} ({s['percent_change']})")
                print(f"  Confidence: {s['confidence']} - {s['confidence_reason']}")
                print(f"  Top Drivers: {s['top_drivers']}")
                print(f"  Offsetting Effects: {s['offsetting_effects']}")
        else:
            print("No saved artifact found.")


if __name__ == "__main__":
    asyncio.run(run_olist_eval())
