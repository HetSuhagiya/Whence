from collections.abc import Awaitable, Callable
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class QueryRunnerProtocol(Protocol):
    """
    Small warehouse-agnostic interface for the explain engine.
    Receives data through this interface so unit tests and eval harness
    can supply mock, in-memory, or direct warehouse data with zero web dependencies.
    """

    async def __call__(self, sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        ...


SyncQueryRunner = Callable[[str, dict[str, Any] | None], list[dict[str, Any]]]
AsyncQueryRunner = Callable[[str, dict[str, Any] | None], Awaitable[list[dict[str, Any]]]]
