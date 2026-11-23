import json
import re
import time
from abc import ABC, abstractmethod
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel

from app.config import get_settings
from app.narrative.models import TokenUsageLog

T = TypeVar("T", bound=BaseModel)


class DailyTokenTracker:
    """In-memory daily token counter enforcing daily usage cap from settings."""

    def __init__(self) -> None:
        self.current_day: str = time.strftime("%Y-%m-%d")
        self.used_tokens: int = 0

    def add(self, tokens: int, limit: int) -> bool:
        today = time.strftime("%Y-%m-%d")
        if today != self.current_day:
            self.current_day = today
            self.used_tokens = 0
        if self.used_tokens + tokens > limit:
            return False
        self.used_tokens += tokens
        return True

    def check_can_spend(self, limit: int) -> bool:
        today = time.strftime("%Y-%m-%d")
        if today != self.current_day:
            self.current_day = today
            self.used_tokens = 0
        return self.used_tokens < limit


daily_token_tracker = DailyTokenTracker()


class LLMClient(ABC):
    """Abstract provider-agnostic interface for structured narrative generation."""

    @abstractmethod
    async def generate_structured(
        self,
        system_prompt: str,
        user_prompt: str,
        schema: type[T],
        temperature: float = 0.1,
    ) -> tuple[T, TokenUsageLog]:
        """Generate structured response matching the Pydantic schema."""
        pass


class GeminiProvider(LLMClient):
    """Google Gemini API provider using REST endpoint with schema-constrained decoding."""

    def __init__(self, api_key: str, model_name: str, base_url: str | None = None) -> None:
        self.api_key = api_key
        self.model_name = model_name
        self.base_url = (base_url or "https://generativelanguage.googleapis.com").rstrip("/")

    async def generate_structured(
        self,
        system_prompt: str,
        user_prompt: str,
        schema: type[T],
        temperature: float = 0.1,
    ) -> tuple[T, TokenUsageLog]:
        settings = get_settings()
        if not daily_token_tracker.check_can_spend(settings.LLM_DAILY_TOKEN_LIMIT):
            raise RuntimeError(f"Daily token limit of {settings.LLM_DAILY_TOKEN_LIMIT} exceeded.")

        url = f"{self.base_url}/v1beta/models/{self.model_name}:generateContent?key={self.api_key}"
        payload = {
            "contents": [
                {"role": "user", "parts": [{"text": f"{system_prompt}\n\n{user_prompt}"}]}
            ],
            "generationConfig": {
                "temperature": temperature,
                "responseMimeType": "application/json",
            },
        }

        start = time.perf_counter()
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()

        latency = (time.perf_counter() - start) * 1000.0

        # Extract text response
        candidates = data.get("candidates", [])
        if not candidates:
            raise ValueError("No candidates returned from Gemini API")
        raw_text = candidates[0]["content"]["parts"][0]["text"]

        # Token usage
        usage = data.get("usageMetadata", {})
        prompt_tokens = usage.get("promptTokenCount", 0)
        completion_tokens = usage.get("candidatesTokenCount", 0)
        total_tokens = usage.get("totalTokenCount", prompt_tokens + completion_tokens)

        daily_token_tracker.add(total_tokens, settings.LLM_DAILY_TOKEN_LIMIT)

        parsed_json = json.loads(raw_text)
        validated = schema.model_validate(parsed_json)

        usage_log = TokenUsageLog(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            latency_ms=latency,
            model=self.model_name,
            timestamp=time.time(),
        )
        return validated, usage_log


class OpenAICompatibleProvider(LLMClient):
    """OpenAI-compatible chat completion provider (supports OpenAI, Groq, Ollama, vLLM)."""

    def __init__(self, api_key: str, model_name: str, base_url: str | None = None) -> None:
        self.api_key = api_key
        self.model_name = model_name
        self.base_url = (base_url or "https://api.openai.com/v1").rstrip("/")

    async def generate_structured(
        self,
        system_prompt: str,
        user_prompt: str,
        schema: type[T],
        temperature: float = 0.1,
    ) -> tuple[T, TokenUsageLog]:
        settings = get_settings()
        if not daily_token_tracker.check_can_spend(settings.LLM_DAILY_TOKEN_LIMIT):
            raise RuntimeError(f"Daily token limit of {settings.LLM_DAILY_TOKEN_LIMIT} exceeded.")

        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Whence Analytics",
        }
        payload: dict[str, Any] = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": 500,
            "response_format": {"type": "json_object"},
        }
        # Disable chain-of-thought reasoning tokens for narrative generation when on OpenRouter
        # (models like nemotron-3.5 generate thousands of hidden reasoning tokens, causing 30s+ latency)
        if "openrouter.ai" in self.base_url:
            payload["reasoning"] = {"max_tokens": 0}

        start = time.perf_counter()
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            # Some providers/free models reject response_format={"type": "json_object"} or reasoning
            if resp.status_code == 400 and any(k in resp.text for k in ("response_format", "reasoning")):
                payload_fallback = dict(payload)
                payload_fallback.pop("response_format", None)
                payload_fallback.pop("reasoning", None)
                resp = await client.post(url, headers=headers, json=payload_fallback)

            if resp.is_error:
                error_body = resp.text
                try:
                    err_json = resp.json()
                    if "error" in err_json:
                        err_obj = err_json["error"]
                        error_body = err_obj.get("message", str(err_obj)) if isinstance(err_obj, dict) else str(err_obj)
                except Exception:
                    pass
                raise RuntimeError(f"OpenRouter API error ({resp.status_code}): {error_body}")

            data = resp.json()

        latency = (time.perf_counter() - start) * 1000.0

        if "error" in data:
            raise RuntimeError(f"LLM API error: {data['error']}")
        if "choices" not in data or not data["choices"]:
            raise ValueError(f"No choices returned from LLM API: {data}")

        choice = data["choices"][0]
        content = choice.get("message", {}).get("content", "")
        if not content:
            raise ValueError(f"Empty content returned from LLM choice: {choice}")

        usage = data.get("usage", {})
        prompt_tokens = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)
        total_tokens = usage.get("total_tokens", prompt_tokens + completion_tokens)

        daily_token_tracker.add(total_tokens, settings.LLM_DAILY_TOKEN_LIMIT)

        # Robust JSON cleaning (handle markdown code blocks if present)
        cleaned = content.strip()
        if "```" in cleaned:
            match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
            if match:
                cleaned = match.group(1).strip()

        parsed_json = json.loads(cleaned)
        validated = schema.model_validate(parsed_json)

        usage_log = TokenUsageLog(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            latency_ms=latency,
            model=self.model_name,
            timestamp=time.time(),
        )
        return validated, usage_log


class FakeLLMClient(LLMClient):
    """Test fake for unit testing without network or credentials."""

    def __init__(
        self,
        canned_response: BaseModel | None = None,
        should_fail: bool = False,
        raw_payload_spy: list[dict[str, Any]] | None = None,
    ) -> None:
        self.canned_response = canned_response
        self.should_fail = should_fail
        self.raw_payload_spy = raw_payload_spy if raw_payload_spy is not None else []

    async def generate_structured(
        self,
        system_prompt: str,
        user_prompt: str,
        schema: type[T],
        temperature: float = 0.1,
    ) -> tuple[T, TokenUsageLog]:
        self.raw_payload_spy.append({
            "system_prompt": system_prompt,
            "user_prompt": user_prompt,
            "temperature": temperature,
        })
        if self.should_fail:
            raise RuntimeError("Fake LLM forced error")

        if self.canned_response is not None:
            res = schema.model_validate(self.canned_response.model_dump())
        else:
            res = schema.model_validate({
                "headline": "Revenue increased by 10.0% during the period.",
                "supporting_sentences": [
                    "Category Apparel drove the increase.",
                    "No other category exhibited unexpected movement.",
                ],
                "caveats": ["Growth may reflect regular seasonality."],
            })

        usage = TokenUsageLog(
            prompt_tokens=150,
            completion_tokens=45,
            total_tokens=195,
            latency_ms=12.5,
            model="fake-test-model",
            timestamp=time.time(),
        )
        return res, usage


def get_llm_client() -> LLMClient | None:
    """Factory returning configured LLM client, or None if no API key is set."""
    settings = get_settings()
    if not settings.LLM_API_KEY or not settings.LLM_MODEL:
        return None

    provider = settings.LLM_PROVIDER.lower().strip()
    if provider == "gemini":
        return GeminiProvider(
            api_key=settings.LLM_API_KEY,
            model_name=settings.LLM_MODEL,
            base_url=settings.LLM_BASE_URL,
        )

    base_url = settings.LLM_BASE_URL
    if not base_url and provider in ("openrouter", "open_router"):
        base_url = "https://openrouter.ai/api/v1"

    return OpenAICompatibleProvider(
        api_key=settings.LLM_API_KEY,
        model_name=settings.LLM_MODEL,
        base_url=base_url,
    )
