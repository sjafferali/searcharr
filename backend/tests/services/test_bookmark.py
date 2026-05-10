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

    def test_falls_back_to_torrent_url_when_no_magnet(self):
        key = compute_dedup_key(
            magnet_link=None,
            torrent_url="HTTPS://Example.COM/path/file.torrent?token=abc",
            info_url="http://other.example.com/info",
        )
        assert key == "url:https://example.com/path/file.torrent?token=abc"

    def test_falls_back_to_info_url_when_no_others(self):
        key = compute_dedup_key(
            magnet_link=None,
            torrent_url=None,
            info_url="https://Example.com/details/12345",
        )
        assert key == "url:https://example.com/details/12345"

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
