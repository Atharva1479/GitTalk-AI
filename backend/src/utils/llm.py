from langchain_google_genai import ChatGoogleGenerativeAI  # type: ignore
from dotenv import load_dotenv
import os
from typing import Optional
import asyncio
import logging

load_dotenv()

LLM_TIMEOUT_SECONDS = 120


class KeyManager:
    def __init__(self):
        self.main_key = os.getenv("GEMINI_API_KEY")
        self.fallback_count = int(os.getenv("FALLBACK_COUNT", "0"))
        self.fallback_keys = [
            os.getenv(f"FALLBACK_{i}")
            for i in range(1, self.fallback_count + 1)
            if os.getenv(f"FALLBACK_{i}")
        ]
        self.current_key_index = 0  # Start with main key
        self.tried_keys: set[str | None] = set()
        self.model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        self._llm = self._create_llm(self.main_key)

    def _create_llm(self, api_key: str | None) -> ChatGoogleGenerativeAI:
        return ChatGoogleGenerativeAI(
            model=self.model_name,
            google_api_key=api_key,
            temperature=0.7,
            top_p=0.95,
            max_output_tokens=16384,
        )

    @property
    def llm(self) -> ChatGoogleGenerativeAI:
        return self._llm

    def get_next_key(self) -> Optional[str]:
        """
        Get the next API key to use.
        If the main key is exhausted, it will try the fallback keys in order.
        Returns:
            The next API key to use, or None if all keys have been exhausted.
        """
        if self.current_key_index == 0:  # If we're on main key
            self.tried_keys.add(self.main_key)
            if self.fallback_keys:  # If we have fallback keys
                self.current_key_index = 1
                next_key = self.fallback_keys[0]
                self._llm = self._create_llm(next_key)
                return next_key
        else:  # If we're on a fallback key
            current_key = self.fallback_keys[self.current_key_index - 1]
            self.tried_keys.add(current_key)
            if self.current_key_index < len(self.fallback_keys):
                next_key = self.fallback_keys[self.current_key_index]
                self.current_key_index += 1
                self._llm = self._create_llm(next_key)
                return next_key
        return None

    def reset(self):
        """
        Reset the key manager to its initial state.
        This is useful for reinitializing the API client after all keys have been exhausted.
        """
        self.current_key_index = 0
        self.tried_keys.clear()
        self._llm = self._create_llm(self.main_key)


# Create a global instance of KeyManager
key_manager = KeyManager()


from collections.abc import AsyncGenerator


async def generate_response(prompt: str) -> tuple[str, dict[str, int]]:
    """
    Generate a response from the LLM (non-streaming fallback).

    Returns:
        A tuple of (response_text, token_usage).
    """
    while True:
        try:
            response = await asyncio.wait_for(
                key_manager.llm.ainvoke(prompt),
                timeout=LLM_TIMEOUT_SECONDS,
            )
            token_usage = {"prompt_tokens": 0, "response_tokens": 0}
            if hasattr(response, "usage_metadata") and response.usage_metadata:
                token_usage["prompt_tokens"] = response.usage_metadata.get("input_tokens", 0)
                token_usage["response_tokens"] = response.usage_metadata.get("output_tokens", 0)
            return response.content, token_usage
        except asyncio.TimeoutError:
            logging.error(f"LLM response timed out after {LLM_TIMEOUT_SECONDS}s")
            raise TimeoutError(
                f"LLM response timed out after {LLM_TIMEOUT_SECONDS} seconds"
            )
        except Exception as e:
            if "RESOURCE_EXHAUSTED" in str(e):
                next_key = key_manager.get_next_key()
                if next_key is None:
                    key_manager.reset()
                    raise ValueError(
                        "OUT_OF_KEYS: All available API keys have been exhausted"
                    )
                continue
            raise


async def generate_response_stream(prompt: str) -> AsyncGenerator[str, None]:
    """
    Stream response tokens from the LLM.

    Yields:
        Individual text chunks as they are generated.

    Raises:
        ValueError: If all API keys have been exhausted.
        TimeoutError: If first chunk takes too long.
    """
    while True:
        try:
            first_chunk = True
            async for chunk in key_manager.llm.astream(prompt):
                if first_chunk:
                    first_chunk = False
                text = chunk.content if hasattr(chunk, "content") else str(chunk)
                if text:
                    yield text
            return
        except Exception as e:
            if "RESOURCE_EXHAUSTED" in str(e):
                next_key = key_manager.get_next_key()
                if next_key is None:
                    key_manager.reset()
                    raise ValueError(
                        "OUT_OF_KEYS: All available API keys have been exhausted"
                    )
                continue
            raise
