"""
Unit tests for bookmark dedup-key normalization.
"""

from app.services.bookmark import compute_dedup_key


class TestComputeDedupKey:
    def test_prefers_magnet_infohash_over_other_signals(self):
        key = compute_dedup_key(
            magnet_link="magnet:?xt=urn:btih:ABCDEF1234567890ABCDEF1234567890ABCDEF12&dn=foo",
            torrent_url="http://example.com/file.torrent",
            info_url="http://example.com/info",
        )
        assert key == "btih:abcdef1234567890abcdef1234567890abcdef12"

    def test_magnet_with_uppercase_hash_is_lowercased(self):
        key = compute_dedup_key(
            magnet_link="magnet:?xt=urn:btih:DEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF",
            torrent_url=None,
            info_url=None,
        )
        assert key == "btih:deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"

    def test_content_signature_preferred_over_urls_when_no_magnet(self):
        # Proxied download/details URLs from Jackett/Prowlarr embed single-use
        # tokens, so the stable identity comes from the release metadata.
        key = compute_dedup_key(
            magnet_link=None,
            torrent_url="http://prowlarr:9696/21/download?apikey=K&link=BLOB1&file=Foo",
            info_url="https://tracker/details.php?id=abc&hit=1",
            source="Prowlarr",
            indexer="GAYtorrent.ru2 free",
            title="of leo and max",
            size=27283779584,
        )
        assert key == "sig:27283779584|Prowlarr|GAYtorrent.ru2 free|of leo and max"

    def test_content_signature_stable_when_download_url_rotates(self):
        common = {
            "magnet_link": None,
            "info_url": "https://tracker/details.php?id=abc&hit=1",
            "source": "Prowlarr",
            "indexer": "GAYtorrent.ru2 free",
            "title": "of leo and max",
            "size": 27283779584,
        }
        first = compute_dedup_key(
            torrent_url="http://prowlarr:9696/21/download?link=BLOB1", **common
        )
        second = compute_dedup_key(
            torrent_url="http://prowlarr:9696/21/download?link=BLOB2", **common
        )
        assert first == second

    def test_magnet_infohash_still_wins_over_content_signature(self):
        key = compute_dedup_key(
            magnet_link="magnet:?xt=urn:btih:ABCDEF1234567890ABCDEF1234567890ABCDEF12",
            torrent_url=None,
            info_url=None,
            source="Prowlarr",
            indexer="Some Indexer",
            title="Some Release",
            size=123,
        )
        assert key == "btih:abcdef1234567890abcdef1234567890abcdef12"

    def test_missing_size_defaults_to_zero_in_signature(self):
        key = compute_dedup_key(
            magnet_link=None,
            torrent_url=None,
            info_url=None,
            source="Jackett",
            indexer="ExampleTracker",
            title="A Release",
            size=None,
        )
        assert key == "sig:0|Jackett|ExampleTracker|A Release"

    def test_info_url_preferred_over_torrent_url_without_signature_fields(self):
        key = compute_dedup_key(
            magnet_link=None,
            torrent_url="HTTPS://Example.COM/path/file.torrent?token=abc",
            info_url="http://other.example.com/info",
        )
        assert key == "url:http://other.example.com/info"

    def test_falls_back_to_torrent_url_when_only_torrent_url(self):
        key = compute_dedup_key(
            magnet_link=None,
            torrent_url="HTTPS://Example.COM/path/file.torrent?token=abc",
            info_url=None,
        )
        assert key == "url:https://example.com/path/file.torrent?token=abc"

    def test_falls_back_to_info_url_when_no_others(self):
        key = compute_dedup_key(
            magnet_link=None,
            torrent_url=None,
            info_url="https://Example.com/details/12345",
        )
        assert key == "url:https://example.com/details/12345"

    def test_partial_signature_fields_fall_through_to_urls(self):
        # Missing indexer => no signature; falls through to the URL forms.
        key = compute_dedup_key(
            magnet_link=None,
            torrent_url=None,
            info_url="https://example.com/details/9",
            source="Prowlarr",
            indexer="",
            title="A Release",
        )
        assert key == "url:https://example.com/details/9"

    def test_returns_none_when_all_inputs_missing(self):
        assert compute_dedup_key(magnet_link=None, torrent_url=None, info_url=None) is None

    def test_returns_none_when_inputs_unusable(self):
        assert (
            compute_dedup_key(magnet_link="not-a-magnet", torrent_url="", info_url="not-a-url")
            is None
        )

    def test_magnet_without_infohash_falls_back_to_torrent_url(self):
        key = compute_dedup_key(
            magnet_link="magnet:?dn=just-a-name",
            torrent_url="http://example.com/file.torrent",
            info_url=None,
        )
        assert key == "url:http://example.com/file.torrent"

    def test_v2_btmh_hash_is_recognized(self):
        # BitTorrent v2 uses btmh prefix
        key = compute_dedup_key(
            magnet_link="magnet:?xt=urn:btmh:1220abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678",
            torrent_url=None,
            info_url=None,
        )
        assert key is not None
        assert key.startswith("btih:")
