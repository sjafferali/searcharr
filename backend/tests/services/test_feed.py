"""
Tests for the FeedService filter logic.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from app.models import Feed, FeedIndexer, JackettInstance, ProwlarrInstance
from app.schemas.feed import FeedFilters, FeedSortStrategy
from app.schemas.search import SearchCategory, SearchResult
from app.services.feed import FeedService


def _result(
    *,
    id_: str = "abc123",
    title: str = "Ubuntu 24.04 LTS",
    seeders: int = 50,
    size: int = 4_700_000_000,
    freeleech: bool = False,
    indexer: str = "iptorrents",
    date: datetime | None = None,
) -> SearchResult:
    return SearchResult(
        id=id_,
        title=title,
        source="Jackett",
        source_type="jackett",
        indexer=indexer,
        size=size,
        size_formatted="4.7 GB",
        seeders=seeders,
        leechers=2,
        date=date if date is not None else datetime.now(UTC),
        category="Software",
        magnet_link=None,
        torrent_url="http://example.com/x.torrent",
        info_url=None,
        freeleech=freeleech,
        download_volume_factor=0.0 if freeleech else 1.0,
    )


class TestFeedFilters:
    def test_freeleech_only_keeps_freeleech_items(self):
        items = [
            _result(id_="a", freeleech=True),
            _result(id_="b", freeleech=False),
        ]
        errors: list[str] = []
        kept = FeedService._apply_filters(
            items,
            FeedFilters(category=SearchCategory.ALL, freeleech_only=True),
            errors,
        )
        assert [r.id for r in kept] == ["a"]

    def test_min_seeders_filters_low_seeders(self):
        items = [
            _result(id_="a", seeders=10),
            _result(id_="b", seeders=2),
        ]
        errors: list[str] = []
        kept = FeedService._apply_filters(
            items,
            FeedFilters(category=SearchCategory.ALL, min_seeders=5),
            errors,
        )
        assert [r.id for r in kept] == ["a"]

    def test_size_bounds_inclusive(self):
        items = [
            _result(id_="small", size=500_000),
            _result(id_="ok", size=2_000_000),
            _result(id_="big", size=10_000_000),
        ]
        errors: list[str] = []
        kept = FeedService._apply_filters(
            items,
            FeedFilters(
                category=SearchCategory.ALL,
                min_size_bytes=1_000_000,
                max_size_bytes=5_000_000,
            ),
            errors,
        )
        assert [r.id for r in kept] == ["ok"]

    def test_include_regex_case_insensitive(self):
        items = [
            _result(id_="a", title="Some.Movie.2160p.BluRay.x265"),
            _result(id_="b", title="Some.Movie.1080p.WEB-DL.x264"),
        ]
        errors: list[str] = []
        kept = FeedService._apply_filters(
            items,
            FeedFilters(category=SearchCategory.ALL, include_regex=r"2160P"),
            errors,
        )
        assert [r.id for r in kept] == ["a"]

    def test_exclude_regex_drops_matches(self):
        items = [
            _result(id_="a", title="Album [FLAC]"),
            _result(id_="b", title="Album (Remix) [FLAC]"),
        ]
        errors: list[str] = []
        kept = FeedService._apply_filters(
            items,
            FeedFilters(category=SearchCategory.ALL, exclude_regex=r"remix"),
            errors,
        )
        assert [r.id for r in kept] == ["a"]

    def test_invalid_regex_is_recorded_as_error_not_raised(self):
        items = [_result()]
        errors: list[str] = []
        kept = FeedService._apply_filters(
            items,
            FeedFilters(category=SearchCategory.ALL, include_regex="["),
            errors,
        )
        # Invalid regex doesn't apply, so the item passes through
        assert len(kept) == 1
        assert any("include regex" in e for e in errors)

    def test_filters_compose(self):
        items = [
            _result(id_="a", title="Ubuntu Server", seeders=100, freeleech=True),
            _result(id_="b", title="Ubuntu Desktop", seeders=2, freeleech=True),
            _result(id_="c", title="Ubuntu Server", seeders=100, freeleech=False),
            _result(id_="d", title="Other Distro", seeders=100, freeleech=True),
        ]
        errors: list[str] = []
        kept = FeedService._apply_filters(
            items,
            FeedFilters(
                category=SearchCategory.ALL,
                freeleech_only=True,
                min_seeders=10,
                include_regex="ubuntu",
            ),
            errors,
        )
        assert [r.id for r in kept] == ["a"]


class TestSortStrategy:
    """End-to-end fetch behavior for the two sort_strategy values."""

    @pytest.mark.asyncio
    async def test_date_desc_resorts_merged_results(self):
        """Default strategy reorders the concatenated stream by pubDate desc."""
        feed = self._fake_feed(strategy="date_desc")
        old = datetime(2026, 1, 1, tzinfo=UTC)
        recent = datetime(2026, 5, 10, tzinfo=UTC)

        async def fake_jackett(*args, **kwargs):
            # Returned in arbitrary order; older first, newer second.
            return [
                _result(id_="old-from-jackett", date=old),
                _result(id_="new-from-jackett", date=recent),
            ], None

        service = self._service_with_jackett(fake_jackett)
        results, _, sources = await service.fetch(feed)
        assert sources == 1
        assert [r.id for r in results] == ["new-from-jackett", "old-from-jackett"]

    @pytest.mark.asyncio
    async def test_indexer_order_preserves_upstream_order(self):
        """``indexer_order`` must keep the per-instance order intact."""
        feed = self._fake_feed(strategy="indexer_order")
        old = datetime(2026, 1, 1, tzinfo=UTC)
        recent = datetime(2026, 5, 10, tzinfo=UTC)

        async def fake_jackett(*args, **kwargs):
            # Older first — simulates a Prowlarr ``orderby=freeleechstart``
            # that intentionally surfaces stale-but-still-freeleech items
            # at the top.
            return [
                _result(id_="first-from-source", date=old),
                _result(id_="second-from-source", date=recent),
            ], None

        service = self._service_with_jackett(fake_jackett)
        results, _, sources = await service.fetch(feed)
        assert sources == 1
        # Order is preserved — date_desc would have flipped these.
        assert [r.id for r in results] == ["first-from-source", "second-from-source"]

    @pytest.mark.asyncio
    async def test_indexer_order_concatenates_jackett_then_prowlarr(self):
        """Multi-instance feeds concatenate in dispatch order: Jackett, then Prowlarr."""
        feed = Feed(
            name="Mixed",
            description=None,
            category="All",
            freeleech_only=False,
            min_seeders=0,
            min_size_bytes=None,
            max_size_bytes=None,
            include_regex=None,
            exclude_regex=None,
            sort_strategy="indexer_order",
        )
        feed.indexers = [
            FeedIndexer(
                source_type="jackett",
                source_instance_id=1,
                source_instance_name="J",
                indexer_id="j1",
                indexer_name="J1",
            ),
            FeedIndexer(
                source_type="prowlarr",
                source_instance_id=1,
                source_instance_name="P",
                indexer_id="2",
                indexer_name="P1",
            ),
        ]

        recent = datetime(2026, 5, 10, tzinfo=UTC)
        old = datetime(2026, 1, 1, tzinfo=UTC)

        async def fake_jackett(*args, **kwargs):
            # Jackett returns the OLDER item.
            return [_result(id_="from-jackett", date=old)], None

        async def fake_prowlarr(*args, **kwargs):
            # Prowlarr returns the NEWER item.
            return [_result(id_="from-prowlarr", date=recent)], None

        service = FeedService(db=None)  # type: ignore[arg-type]
        service._load_jackett_instances = AsyncMock(  # type: ignore[method-assign]
            return_value=[JackettInstance(id=1, name="J", url="http://x", api_key="k")]
        )
        service._load_prowlarr_instances = AsyncMock(  # type: ignore[method-assign]
            return_value=[ProwlarrInstance(id=1, name="P", url="http://y", api_key="k")]
        )
        service._fetch_jackett = AsyncMock(side_effect=fake_jackett)  # type: ignore[method-assign]
        service._fetch_prowlarr = AsyncMock(side_effect=fake_prowlarr)  # type: ignore[method-assign]

        results, _, sources = await service.fetch(feed)

        assert sources == 2
        # Even though Prowlarr's item is newer, indexer_order keeps Jackett-first.
        assert [r.id for r in results] == ["from-jackett", "from-prowlarr"]

    # ---- helpers ---------------------------------------------------------

    @staticmethod
    def _fake_feed(*, strategy: str) -> Feed:
        feed = Feed(
            name="Test",
            description=None,
            category="All",
            freeleech_only=False,
            min_seeders=0,
            min_size_bytes=None,
            max_size_bytes=None,
            include_regex=None,
            exclude_regex=None,
            sort_strategy=strategy,
        )
        feed.indexers = [
            FeedIndexer(
                source_type="jackett",
                source_instance_id=1,
                source_instance_name="J",
                indexer_id="ip",
                indexer_name="IP",
            )
        ]
        return feed

    @staticmethod
    def _service_with_jackett(jackett_handler) -> FeedService:
        service = FeedService(db=None)  # type: ignore[arg-type]
        # Replace the loaders + per-source fetchers in-place; ``fetch`` calls
        # them in dispatch order.
        instance = JackettInstance(id=1, name="J", url="http://x", api_key="k")
        service._load_jackett_instances = AsyncMock(return_value=[instance])  # type: ignore[method-assign]
        service._load_prowlarr_instances = AsyncMock(return_value=[])  # type: ignore[method-assign]
        service._fetch_jackett = AsyncMock(side_effect=jackett_handler)  # type: ignore[method-assign]
        service._fetch_prowlarr = AsyncMock()  # type: ignore[method-assign]
        return service


# Sanity: enum values are exactly what the migration's server_default uses.
def test_sort_strategy_enum_values_match_db_default():
    assert FeedSortStrategy.DATE_DESC.value == "date_desc"
    assert FeedSortStrategy.INDEXER_ORDER.value == "indexer_order"
