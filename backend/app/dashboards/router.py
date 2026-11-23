from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from app.dashboards.models import (
    ChartRunRequest,
    DashboardCreate,
    DashboardPublic,
    ExplainRequest,
)
from app.dashboards.service import dashboard_service

router = APIRouter(prefix="/dashboards", tags=["dashboards"])


@router.post("", response_model=DashboardPublic, status_code=status.HTTP_201_CREATED)
async def create_dashboard(req: DashboardCreate) -> DashboardPublic:
    try:
        return dashboard_service.create_dashboard(req)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)) from e


@router.get("", response_model=list[DashboardPublic])
async def list_dashboards() -> list[DashboardPublic]:
    try:
        return dashboard_service.list_dashboards()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)) from e


@router.get("/{dashboard_id}", response_model=DashboardPublic)
async def get_dashboard(dashboard_id: str) -> DashboardPublic:
    try:
        return dashboard_service.get_dashboard(dashboard_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)) from e


@router.delete("/{dashboard_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dashboard(dashboard_id: str) -> None:
    try:
        dashboard_service.delete_dashboard(dashboard_id)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)) from e


@router.post("/{dashboard_id}/charts/{chart_id}/run")
async def run_chart(
    dashboard_id: str,
    chart_id: str,
    req: ChartRunRequest,
):
    try:
        return await dashboard_service.run_chart(dashboard_id, chart_id, req)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)) from e


@router.post("/{dashboard_id}/charts/{chart_id}/explain")
async def explain_chart(
    dashboard_id: str,
    chart_id: str,
    req: ExplainRequest,
):
    """Streams server-sent events for the 10-step explain pipeline."""
    return StreamingResponse(
        dashboard_service.stream_explain(dashboard_id, chart_id, req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
