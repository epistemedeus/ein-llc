"""Explicit CrewAI adapter checks. Not under a test/ directory and not named
to match Node's default `node --test` globs, so a root-only npm ci plus
unscoped `node --test` will not load them.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ADAPTER_DIR = Path(__file__).resolve().parents[1]
if str(ADAPTER_DIR) not in sys.path:
    sys.path.insert(0, str(ADAPTER_DIR))

from adapter import (  # noqa: E402
    DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS,
    PUBLIC_TOOL_NAMES,
    create_ein_llc_crewai_adapter,
    invoke_public_tool,
    parse_tool_result,
)


class EinLlcCrewAiAdapterChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._context = create_ein_llc_crewai_adapter()
        cls.tools = cls._context.__enter__()

    @classmethod
    def tearDownClass(cls) -> None:
        cls._context.__exit__(None, None, None)

    def test_binds_the_four_public_tools(self) -> None:
        self.assertEqual(
            sorted(tool.name for tool in self.tools),
            sorted(PUBLIC_TOOL_NAMES),
        )

    def test_delaware_may_31_first_year_total_is_110_dollars(self) -> None:
        raw = invoke_public_tool(
            self.tools,
            "get_state_fees",
            state="DE",
            formationDate="2027-05-31",
        )
        result = parse_tool_result(raw)
        self.assertIsInstance(result, dict)
        self.assertEqual(result["firstYearStateTotalCents"], DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS)
        self.assertEqual(
            result["firstYear"]["window"],
            {"from": "2027-05-31", "through": "2028-05-31", "inclusive": True},
        )

    def test_invalid_february_29_2027_is_refused_by_existing_tool_schema(self) -> None:
        with self.assertRaises((ValueError, Exception)) as caught:
            invoke_public_tool(
                self.tools,
                "get_state_fees",
                state="DE",
                formationDate="2027-02-29",
            )
        message = str(caught.exception)
        self.assertRegex(
            message,
            r"validation failed|validation error|day value is outside expected range|valid date",
            msg=f"unexpected exception: {caught.exception!r}",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
