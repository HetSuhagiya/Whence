from fastapi import APIRouter, HTTPException, Query, status

from app.semantic.models import (
    AutoSuggestResponse,
    DefaultEcommerceSetRequest,
    DimensionCreate,
    DimensionPublic,
    DimensionUpdate,
    MetricCreate,
    MetricPreviewRequest,
    MetricPreviewResponse,
    MetricPublic,
    MetricUpdate,
    MetricValidateRequest,
    MetricValidateResponse,
    MetricVersionPublic,
    ModelCreate,
    ModelPublic,
    ModelUpdate,
)
from app.semantic.service import semantic_service

router = APIRouter(prefix="/semantic", tags=["Semantic Layer"])


# -------------------------------------------------------------
# Models Endpoints
# -------------------------------------------------------------
@router.post("/models", response_model=ModelPublic, status_code=status.HTTP_201_CREATED)
async def create_model(req: ModelCreate) -> ModelPublic:
    try:
        return semantic_service.create_model(req)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.get("/models", response_model=list[ModelPublic])
async def list_models(connection_id: str | None = Query(None)) -> list[ModelPublic]:
    return semantic_service.list_models(connection_id)


@router.get("/models/{model_id}", response_model=ModelPublic)
async def get_model(model_id: str) -> ModelPublic:
    try:
        return semantic_service.get_model(model_id)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.put("/models/{model_id}", response_model=ModelPublic)
async def update_model(model_id: str, req: ModelUpdate) -> ModelPublic:
    try:
        return semantic_service.update_model(model_id, req)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.post("/models/{model_id}/refresh-anchor", response_model=ModelPublic)
async def refresh_anchor(model_id: str) -> ModelPublic:
    try:
        return await semantic_service.discover_and_set_anchor_date(model_id)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.delete("/models/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model(model_id: str) -> None:
    try:
        semantic_service.delete_model(model_id)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


# -------------------------------------------------------------
# Dimensions Endpoints
# -------------------------------------------------------------
@router.post(
    "/models/{model_id}/dimensions",
    response_model=DimensionPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_dimension(model_id: str, req: DimensionCreate) -> DimensionPublic:
    try:
        return semantic_service.create_dimension(model_id, req)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.put("/dimensions/{dim_id}", response_model=DimensionPublic)
async def update_dimension(dim_id: str, req: DimensionUpdate) -> DimensionPublic:
    try:
        return semantic_service.update_dimension(dim_id, req)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.delete("/dimensions/{dim_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dimension(dim_id: str) -> None:
    try:
        semantic_service.delete_dimension(dim_id)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


# -------------------------------------------------------------
# Metrics Endpoints
# -------------------------------------------------------------
@router.post(
    "/models/{model_id}/metrics", response_model=MetricPublic, status_code=status.HTTP_201_CREATED
)
async def create_metric(model_id: str, req: MetricCreate) -> MetricPublic:
    try:
        return semantic_service.create_metric(model_id, req)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.put("/metrics/{metric_id}", response_model=MetricPublic)
async def update_metric(metric_id: str, req: MetricUpdate) -> MetricPublic:
    try:
        return semantic_service.update_metric(metric_id, req)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.get("/metrics/{metric_id}/versions", response_model=list[MetricVersionPublic])
async def list_metric_versions(metric_id: str) -> list[MetricVersionPublic]:
    return semantic_service.list_metric_versions(metric_id)


@router.delete("/metrics/{metric_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_metric(metric_id: str) -> None:
    try:
        semantic_service.delete_metric(metric_id)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


# -------------------------------------------------------------
# Validation, Preview & Ecommerce Seed
# -------------------------------------------------------------
@router.post("/metrics/validate", response_model=MetricValidateResponse)
async def validate_metric(req: MetricValidateRequest) -> MetricValidateResponse:
    return semantic_service.validate_metric_formula(req)


@router.post("/metrics/preview", response_model=MetricPreviewResponse)
async def preview_metric(req: MetricPreviewRequest) -> MetricPreviewResponse:
    return await semantic_service.preview_metric_trend(req)


@router.get("/models/auto-suggest", response_model=AutoSuggestResponse)
async def auto_suggest(connection_id: str, table_name: str) -> AutoSuggestResponse:
    try:
        return semantic_service.auto_suggest_for_table(connection_id, table_name)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.post("/models/default-ecommerce", response_model=ModelPublic)
async def seed_default_ecommerce(req: DefaultEcommerceSetRequest) -> ModelPublic:
    try:
        return semantic_service.seed_default_ecommerce_set(
            connection_id=req.connection_id,
            project_id=req.project_id,
            dataset_id=req.dataset_id,
            table_name=req.table_name,
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
