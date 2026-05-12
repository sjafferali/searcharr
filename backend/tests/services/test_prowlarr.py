"""
Tests for ProwlarrService.get_latest, which hits the per-indexer Newznab
passthrough at ``/{indexerId}/api?t=search&extended=1``.

HTTP mocking uses ``httpx.MockTransport`` so we don't depend on third-party
mocking libraries — ProwlarrService creates its own ``httpx.AsyncClient``
per request, so we patch the constructor in the prowlarr module to inject
the mock transport.
"""

from collections.abc import Callable
from unittest.mock import patch

import httpx
import pytest
from app.schemas.search import SearchCategory
from app.services.prowlarr import ProwlarrService

PROWLARR_BASE = "http://localhost:9696"
API_KEY = "test-api-key"


def _torznab_response(items_xml: str) -> str:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="1.0" xmlns:torznab="http://torznab.com/schemas/2015/feed">
  <channel>
    <title>Prowlarr</title>
    {items_xml}
  </channel>
</rss>"""


def _patch_httpx(handler: Callable[[httpx.Request], httpx.Response]):
    """
    Patch ``httpx.AsyncClient`` inside the prowlarr module so each call uses
    a ``MockTransport`` driven by ``handler``. The service constructs the
    client with a ``timeout`` kwarg, which we drop because the real default
    timeout doesn't apply to mocked transports. We bind the real
    ``AsyncClient`` class up-front so the factory doesn't recurse into the
    patched lookup.
    """
    transport = httpx.MockTransport(handler)
    real_async_client = httpx.AsyncClient

    def factory(*args: object, **kwargs: object) -> httpx.AsyncClient:
        kwargs.pop("timeout", None)
        return real_async_client(transport=transport)

    return patch("app.services.prowlarr.httpx.AsyncClient", side_effect=factory)


@pytest.mark.asyncio
async def test_get_latest_calls_per_indexer_newznab() -> None:
    received_paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        received_paths.append(request.url.path)
        return httpx.Response(
            200,
            text=_torznab_response(
                """
                <item>
                  <title>Some.Movie.2160p</title>
                  <size>10000000</size>
                  <prowlarrindexer id="7" type="private">REDacted</prowlarrindexer>
                  <torznab:attr name="seeders" value="50"/>
                  <torznab:attr name="peers" value="55"/>
                  <torznab:attr name="tag" value="freeleech"/>
                </item>
                """
            ),
        )

    with _patch_httpx(handler):
        service = ProwlarrService(PROWLARR_BASE, API_KEY)
        results, errors = await service.get_latest(
            instance_name="Prowlarr-Test",
            indexer_ids=["7"],
            category=SearchCategory.ALL,
        )

    assert received_paths == ["/7/api"]
    assert errors == []
    assert len(results) == 1
    r = results[0]
    assert r.indexer == "REDacted"
    assert r.source == "Prowlarr-Test"
    assert r.source_type == "prowlarr"
    assert r.freeleech is True


@pytest.mark.asyncio
async def test_get_latest_fans_out_per_indexer() -> None:
    """Each indexer ID should result in a separate request."""
    routes = {
        "/3/api": _torznab_response(
            """<item>
                <title>From A</title>
                <size>1</size>
                <prowlarrindexer id="3" type="public">A</prowlarrindexer>
              </item>"""
        ),
        "/9/api": _torznab_response(
            """<item>
                <title>From B</title>
                <size>2</size>
                <prowlarrindexer id="9" type="public">B</prowlarrindexer>
              </item>"""
        ),
    }
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        body = routes.get(request.url.path)
        if body is None:
            return httpx.Response(404)
        return httpx.Response(200, text=body)

    with _patch_httpx(handler):
        service = ProwlarrService(PROWLARR_BASE, API_KEY)
        results, errors = await service.get_latest(instance_name="P", indexer_ids=["3", "9"])

    assert sorted(seen) == ["/3/api", "/9/api"]
    assert errors == []
    titles = sorted(r.title for r in results)
    assert titles == ["From A", "From B"]


@pytest.mark.asyncio
async def test_get_latest_skips_non_numeric_ids() -> None:
    """Prowlarr's route is ``{id:int}`` — non-numeric ids must be dropped silently."""
    seen_paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen_paths.append(request.url.path)
        return httpx.Response(200, text=_torznab_response(""))

    with _patch_httpx(handler):
        service = ProwlarrService(PROWLARR_BASE, API_KEY)
        results, errors = await service.get_latest(
            instance_name="P", indexer_ids=["abc", "5", "not-a-number"]
        )

    assert seen_paths == ["/5/api"]
    assert results == []
    assert errors == []


@pytest.mark.asyncio
async def test_get_latest_returns_empty_with_no_indexers() -> None:
    service = ProwlarrService(PROWLARR_BASE, API_KEY)
    assert await service.get_latest(instance_name="P", indexer_ids=None) == ([], [])
    assert await service.get_latest(instance_name="P", indexer_ids=[]) == ([], [])


@pytest.mark.asyncio
async def test_get_latest_reports_429_rate_limit() -> None:
    """A throttled indexer yields no results and a descriptive error."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            429,
            headers={"Retry-After": "60"},
            text="<error>rate limited</error>",
        )

    with _patch_httpx(handler):
        service = ProwlarrService(PROWLARR_BASE, API_KEY)
        results, errors = await service.get_latest(instance_name="P", indexer_ids=["2"])

    assert results == []
    assert len(errors) == 1
    err = errors[0]
    assert err.source == "P"
    assert err.source_type == "prowlarr"
    assert err.indexer == "2"
    assert "rate limited" in err.message.lower()
    assert "60" in err.message


@pytest.mark.asyncio
async def test_get_latest_reports_torznab_error_body() -> None:
    """A Torznab ``<error>`` body (e.g. a disabled indexer) is surfaced."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            text='<?xml version="1.0" encoding="UTF-8"?>'
            '<error code="201" description="Indexer is disabled due to recent failures"/>',
        )

    with _patch_httpx(handler):
        service = ProwlarrService(PROWLARR_BASE, API_KEY)
        results, errors = await service.get_latest(instance_name="P", indexer_ids=["4"])

    assert results == []
    assert len(errors) == 1
    assert "disabled" in errors[0].message.lower()
    assert errors[0].indexer == "4"


@pytest.mark.asyncio
async def test_get_latest_partial_failure_aggregates() -> None:
    """A failure on one indexer shouldn't drop results from another."""
    survivor = _torznab_response(
        """<item>
            <title>Survived</title>
            <size>1</size>
            <prowlarrindexer id="2" type="public">Working</prowlarrindexer>
          </item>"""
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/1/api":
            return httpx.Response(500, text="boom")
        if request.url.path == "/2/api":
            return httpx.Response(200, text=survivor)
        return httpx.Response(404)

    with _patch_httpx(handler):
        service = ProwlarrService(PROWLARR_BASE, API_KEY)
        results, errors = await service.get_latest(instance_name="P", indexer_ids=["1", "2"])

    assert [r.title for r in results] == ["Survived"]
    assert len(errors) == 1
    assert errors[0].indexer == "1"
    assert "500" in errors[0].message


@pytest.mark.asyncio
async def test_get_latest_sends_apikey_and_search_params() -> None:
    """Verify the request shape: apikey, t=search, q empty, extended=1."""
    captured: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        for k, v in request.url.params.multi_items():
            captured[k] = v
        return httpx.Response(200, text=_torznab_response(""))

    with _patch_httpx(handler):
        service = ProwlarrService(PROWLARR_BASE, API_KEY)
        await service.get_latest(
            instance_name="P",
            indexer_ids=["4"],
            category=SearchCategory.MOVIES,
        )

    assert captured.get("apikey") == API_KEY
    assert captured.get("t") == "search"
    assert captured.get("q") == ""
    assert captured.get("extended") == "1"
    assert "cat" in captured
    assert any(c.isdigit() for c in captured["cat"].split(","))


@pytest.mark.asyncio
async def test_search_reports_rate_limit_on_unified_endpoint() -> None:
    """HTTP 429 on /api/v1/search is surfaced as an instance-level error."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, headers={"Retry-After": "120"}, json={"message": "too many"})

    with _patch_httpx(handler):
        service = ProwlarrService(PROWLARR_BASE, API_KEY)
        results, errors = await service.search("ubuntu", instance_name="MyProwlarr")

    assert results == []
    assert len(errors) == 1
    assert errors[0].source == "MyProwlarr"
    assert errors[0].indexer is None
    assert "rate limited" in errors[0].message.lower()
    assert "120" in errors[0].message


@pytest.mark.asyncio
async def test_search_reports_disabled_indexers() -> None:
    """Indexers Prowlarr has backed off are reported even though the search
    itself returns 200 and silently omits them."""
    future = "2099-01-01T00:00:00Z"

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/api/v1/search":
            return httpx.Response(200, json=[])
        if path == "/api/v1/indexerstatus":
            return httpx.Response(
                200,
                json=[
                    {"indexerId": 3, "disabledTill": future, "mostRecentFailure": "2024-01-01"},
                    {"indexerId": 4, "disabledTill": None},
                ],
            )
        if path == "/api/v1/indexer":
            return httpx.Response(200, json=[{"id": 3, "name": "BrokenTracker"}])
        return httpx.Response(404)

    with _patch_httpx(handler):
        service = ProwlarrService(PROWLARR_BASE, API_KEY)
        results, errors = await service.search(
            "ubuntu", instance_name="MyProwlarr", indexer_ids=["3"]
        )

    assert results == []
    assert len(errors) == 1
    assert errors[0].source == "MyProwlarr"
    assert errors[0].indexer == "BrokenTracker"
    assert "disabled" in errors[0].message.lower()
