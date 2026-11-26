"""Explain Narrative & Number Checker integration.
Provides directional verification and Evidence coverage for Whence Explain Detail v2.
"""

from app.narrative.checker import NumberChecker
from app.narrative.fallback import DeterministicFallbackGenerator
from app.narrative.models import NarrativeOutput
from app.narrative.service import NarrativeService, narrative_service

__all__ = [
    "NumberChecker",
    "DeterministicFallbackGenerator",
    "NarrativeOutput",
    "NarrativeService",
    "narrative_service",
]
