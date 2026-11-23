from fastapi import APIRouter, HTTPException, status

from app.connections.models import (
    ConnectionCreateRequest,
    ConnectionKeyUpdateRequest,
    ConnectionPublic,
    ConnectionTestResult,
    SaveSourcesRequest,
    TableDetail,
    TablePreviewResponse,
)
from app.connections.service import connection_service

router = APIRouter(prefix="/connections", tags=["Warehouse Connections"])


@router.post("", response_model=ConnectionPublic, status_code=status.HTTP_201_CREATED)
async def create_connection(req: ConnectionCreateRequest) -> ConnectionPublic:
    try:
        return connection_service.create_connection(req)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)) from e


@router.get("", response_model=list[ConnectionPublic])
async def list_connections() -> list[ConnectionPublic]:
    return connection_service.list_connections()


@router.get("/{connection_id}", response_model=ConnectionPublic)
async def get_connection(connection_id: str) -> ConnectionPublic:
    try:
        return connection_service.get_connection(connection_id)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.put("/{connection_id}/key", response_model=ConnectionPublic)
async def update_key(connection_id: str, req: ConnectionKeyUpdateRequest) -> ConnectionPublic:
    try:
        return connection_service.update_key(connection_id, req.key_json)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_connection(connection_id: str) -> None:
    try:
        connection_service.delete_connection(connection_id)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.post("/{connection_id}/test", response_model=ConnectionTestResult)
async def test_connection(connection_id: str) -> ConnectionTestResult:
    try:
        return connection_service.test_connection(connection_id)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)) from e


@router.put("/{connection_id}/sources", response_model=list[TableDetail])
async def save_sources(connection_id: str, req: SaveSourcesRequest) -> list[TableDetail]:
    try:
        return connection_service.save_sources(connection_id, req.tables)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)) from e


@router.get("/{connection_id}/sources", response_model=list[TableDetail])
async def get_sources(connection_id: str) -> list[TableDetail]:
    try:
        return connection_service.get_sources(connection_id)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.get("/{connection_id}/projects", response_model=list[str])
async def list_projects(connection_id: str) -> list[str]:
    try:
        return connection_service.list_projects(connection_id)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.get("/{connection_id}/projects/{project_id}/datasets", response_model=list[dict[str, str]])
async def list_datasets(connection_id: str, project_id: str) -> list[dict[str, str]]:
    try:
        return connection_service.list_datasets(connection_id, project_id)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.get(
    "/{connection_id}/projects/{project_id}/datasets/{dataset_id}/tables",
    response_model=list[dict[str, str]],
)
async def list_tables(connection_id: str, project_id: str, dataset_id: str) -> list[dict[str, str]]:
    try:
        return connection_service.list_tables(connection_id, project_id, dataset_id)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.get(
    "/{connection_id}/projects/{project_id}/datasets/{dataset_id}/tables/{table_name}",
    response_model=TableDetail,
)
async def get_table_detail(
    connection_id: str, project_id: str, dataset_id: str, table_name: str
) -> TableDetail:
    try:
        return connection_service.get_table_detail(
            connection_id, project_id, dataset_id, table_name
        )
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.get(
    "/{connection_id}/projects/{project_id}/datasets/{dataset_id}/tables/{table_name}/preview",
    response_model=TablePreviewResponse,
)
async def preview_table(
    connection_id: str, project_id: str, dataset_id: str, table_name: str, limit: int = 10
) -> TablePreviewResponse:
    try:
        return connection_service.preview_table(
            connection_id, project_id, dataset_id, table_name, limit
        )
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
