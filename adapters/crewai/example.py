"""No-credential install/use example.

From an ein-llc checkout, after `npm ci --ignore-scripts` at the repo root
and installing this adapter's Python dependencies:

    .venv/bin/python example.py

Calls get_state_fees for a Delaware formation on 2027-05-31 through the
official CrewAI MCPServerAdapter. Under the dated schedule the first-year
total is $110.
"""

from adapter import (
    DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS,
    create_ein_llc_crewai_adapter,
    invoke_public_tool,
    parse_tool_result,
)

with create_ein_llc_crewai_adapter() as tools:
    raw = invoke_public_tool(
        tools,
        "get_state_fees",
        state="DE",
        formationDate="2027-05-31",
    )
    result = parse_tool_result(raw)
    cents = result["firstYearStateTotalCents"]
    payload = {
        "tool": "get_state_fees",
        "input": {"state": "DE", "formationDate": "2027-05-31"},
        "firstYearStateTotalCents": cents,
        "firstYearStateTotalUsd": str(int(cents / 100)),
        "matchesDatedSchedule": cents == DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS,
    }
    print(__import__("json").dumps(payload, indent=2))
    if cents != DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS:
        raise SystemExit(f"Unexpected first-year total: {cents}")
