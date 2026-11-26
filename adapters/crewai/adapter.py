"""Thin CrewAI adapter for the four public ein-llc 0.3 local MCP tools.

Starts the checkout stdio server (`node bin/ein-llc.mjs`) through the official
mcp `StdioServerParameters` and mcpadapt `MCPAdapt` wiring used by
`crewai_tools.MCPServerAdapter`. No API key and no network are required for
the local tools.

Official MCPServerAdapter 1.15.45 builds Pydantic models with CrewAI's
`create_model_from_schema`. That converter currently fails on draft-07 tuple
`items` arrays, which the existing `verify_authority_letter` JWKS `key_ops`
field uses. This adapter gap normalizes those tuple items, then wraps the four
public tools as CrewAI BaseTool objects the same way the official adapter does.
"""

from __future__ import annotations

import json
import os
import shutil
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from crewai.tools import BaseTool
from crewai.utilities.pydantic_schema_utils import create_model_from_schema
from crewai.utilities.string_utils import sanitize_tool_name
from mcp import StdioServerParameters
from mcp.types import CallToolResult, TextContent, Tool
from mcpadapt.core import MCPAdapt, ToolAdapter
from pydantic import BaseModel

PUBLIC_TOOL_NAMES = (
    "get_state_fees",
    "draft_ss4",
    "get_compliance_deadlines",
    "verify_authority_letter",
)

# Documented no-credential Delaware first-year total under the dated schedule.
DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS = 11000


def adapter_directory() -> Path:
    return Path(__file__).resolve().parent


def default_repo_root() -> Path:
    return adapter_directory().parent.parent


def local_stdio_params(repo_root: Path | None = None) -> StdioServerParameters:
    root = Path(repo_root) if repo_root is not None else default_repo_root()
    bin_path = root / "bin" / "ein-llc.mjs"
    if not bin_path.is_file():
        raise FileNotFoundError(
            f"ein-llc stdio entry not found at {bin_path}. "
            "Run this adapter from an ein-llc checkout."
        )
    node = shutil.which("node")
    if not node:
        raise FileNotFoundError("node executable not found on PATH")
    env = {
        key: value
        for key, value in {
            "PATH": os.environ.get("PATH", ""),
            "HOME": os.environ.get("HOME", ""),
            "LANG": os.environ.get("LANG", "C.UTF-8"),
            "LC_ALL": os.environ.get("LC_ALL", ""),
        }.items()
        if value
    }
    return StdioServerParameters(
        command=node,
        args=[str(bin_path)],
        cwd=str(root),
        env=env,
    )


def normalize_json_schema(schema: Any) -> Any:
    """Rewrite draft-07 tuple `items` arrays so CrewAI schema utils can build a model.

    `verify_authority_letter` describes `jwks.keys[].key_ops` as a one-entry
    tuple (`items: [{ const: "verify" }]`). Official `create_model_from_schema`
    expects `items` to be an object and otherwise raises AttributeError.
    """
    if isinstance(schema, list):
        return [normalize_json_schema(item) for item in schema]
    if not isinstance(schema, dict):
        return schema
    normalized: dict[str, Any] = {}
    for key, value in schema.items():
        if key == "items" and isinstance(value, list):
            entries = [normalize_json_schema(item) for item in value]
            normalized["items"] = entries[0] if len(entries) == 1 else {"anyOf": entries}
        elif key == "prefixItems" and isinstance(value, list):
            entries = [normalize_json_schema(item) for item in value]
            normalized["items"] = entries[0] if len(entries) == 1 else {"anyOf": entries}
        elif key == "additionalItems" and value is False:
            continue
        else:
            normalized[key] = normalize_json_schema(value)
    return normalized


def json_compatible(value: Any) -> Any:
    """Turn Pydantic-coerced values (such as date) back into JSON for MCP calls."""
    return json.loads(json.dumps(value, default=str))


class EinLlcCrewAIToolAdapter(ToolAdapter):
    """Official CrewAI MCP tool wrapper, with JSON Schema normalization."""

    def adapt(
        self,
        func: Callable[[dict[str, Any] | None], CallToolResult],
        mcp_tool: Tool,
    ) -> BaseTool:
        tool_name = sanitize_tool_name(mcp_tool.name)
        tool_description = mcp_tool.description or ""
        args_model = create_model_from_schema(normalize_json_schema(mcp_tool.inputSchema))

        class CrewAIMCPTool(BaseTool):
            name: str = tool_name
            description: str = tool_description
            args_schema: type[BaseModel] = args_model

            def _run(self, **kwargs: Any) -> Any:
                # Official BaseTool validation dumps omitted optional fields as
                # null. ein-llc schemas reject null for memberCount and
                # wyomingAssetsCents, so drop None values the way mcpadapt's
                # CrewAIAdapter already does for non-nullable properties.
                payload = json_compatible(kwargs)
                if isinstance(payload, dict):
                    payload = {key: value for key, value in payload.items() if value is not None}
                result = func(payload)
                if result.isError:
                    text = " ".join(
                        content.text
                        for content in result.content
                        if isinstance(content, TextContent)
                    )
                    raise RuntimeError(text or "Local tool execution failed.")
                if len(result.content) == 1:
                    first_content = result.content[0]
                    if isinstance(first_content, TextContent):
                        return first_content.text
                    return str(first_content)
                return str(
                    [
                        content.text
                        for content in result.content
                        if isinstance(content, TextContent)
                    ]
                )

            def _generate_description(self) -> None:
                schema = self.args_schema.model_json_schema()
                schema.pop("$defs", None)
                self.description = (
                    f"Tool Name: {self.name}\n"
                    f"Tool Arguments: {schema}\n"
                    f"Tool Description: {self.description}"
                )

        return CrewAIMCPTool()

    async def async_adapt(self, afunc: Any, mcp_tool: Tool) -> Any:
        raise NotImplementedError("async is not supported by the CrewAI framework.")


@contextmanager
def create_ein_llc_crewai_adapter(
    repo_root: Path | None = None,
    *,
    connect_timeout: int = 60,
) -> Iterator[list[BaseTool]]:
    """Start the local stdio server and yield the four public CrewAI tools."""
    params = local_stdio_params(repo_root)
    session = MCPAdapt(params, EinLlcCrewAIToolAdapter(), connect_timeout)
    try:
        loaded = list(session.__enter__())
        allowed = set(PUBLIC_TOOL_NAMES)
        tools = [tool for tool in loaded if tool.name in allowed]
        found = {tool.name for tool in tools}
        missing = [name for name in PUBLIC_TOOL_NAMES if name not in found]
        if missing:
            raise RuntimeError(f"Missing public ein-llc tools: {', '.join(missing)}")
        yield tools
    finally:
        session.__exit__(None, None, None)


def get_tool(tools: list[BaseTool], name: str) -> BaseTool:
    if name not in PUBLIC_TOOL_NAMES:
        raise ValueError(f"Unsupported public tool: {name}")
    for tool in tools:
        if tool.name == name:
            return tool
    raise KeyError(name)


def invoke_public_tool(tools: list[BaseTool], name: str, **args: Any) -> Any:
    return get_tool(tools, name).run(**args)


def parse_tool_result(result: Any) -> Any:
    if isinstance(result, dict):
        return result
    if isinstance(result, str):
        try:
            return json.loads(result)
        except json.JSONDecodeError:
            return result
    return result
