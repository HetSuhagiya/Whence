from typing import Any

from fastapi import APIRouter, HTTPException, Query, status

from app.compiler.compiler import query_compiler
from app.compiler.spec import ChartExecutionResult, ChartSpec, CompiledQuery

router = APIRouter(prefix="/compiler", tags=["Query Compiler"])


@router.post("/compile", response_model=CompiledQuery)
async def compile_chart_query(spec: ChartSpec, dialect: str = Query("duckdb")) -> CompiledQuery:
    try:
        return query_compiler.compile(spec, dialect=dialect)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)) from e


@router.post("/execute", response_model=ChartExecutionResult)
async def execute_chart_query(spec: ChartSpec) -> Any:
    try:
        return await query_compiler.execute(spec)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)) from e


@router.get("/demo-specs/{model_id}", response_model=list[ChartSpec])
async def get_demo_chart_specs(model_id: str) -> list[ChartSpec]:
    """
    Returns the 5 standard demo chart specs for the model.
    Compiled and executed dynamically on whichever connected warehouse is active.
    """
    return [
        ChartSpec(
            model_id=model_id,
            metric="revenue",
            time_grain="day",
            date_range="last_30_days",
            chart_type="line",
            title="Revenue over time",
        ),
        ChartSpec(
            model_id=model_id,
            metric="revenue",
            dimensions=["category"],
            date_range="last_30_days",
            chart_type="bar",
            title="Revenue by category",
            limit=10,
        ),
        ChartSpec(
            model_id=model_id,
            metric="orders",
            dimensions=["state"],
            date_range="last_30_days",
            chart_type="bar",
            title="Orders by state",
            limit=10,
        ),
        ChartSpec(
            model_id=model_id,
            metric="aov",
            time_grain="day",
            date_range="last_30_days",
            chart_type="line",
            title="Average order value over time",
        ),
        ChartSpec(
            model_id=model_id,
            metric="orders",
            dimensions=["traffic_source"],
            date_range="last_30_days",
            chart_type="stacked_bar",
            title="Orders by traffic source",
            limit=8,
        ),
    ]
