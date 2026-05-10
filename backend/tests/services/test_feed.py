"""
Tests for the FeedService filter logic.
"""

from datetime import UTC, datetime

from app.schemas.feed import FeedFilters
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
        date=datetime.now(UTC),
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
