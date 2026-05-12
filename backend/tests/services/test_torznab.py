"""
Tests for the shared Torznab/Newznab XML parser.

Covers the two upstream conventions for indexer name and tag emission:

* Jackett: ``<jackettindexer>`` plus a single ``<torznab:attr name="tags">``
  with a comma-separated value
* Prowlarr: ``<prowlarrindexer>`` plus one
  ``<torznab:attr name="tag" value="…"/>`` per flag
"""

import httpx
from app.services.torznab import http_error_message, parse_torznab_error, parse_torznab_response


def _wrap(item_xml: str, channel_title: str = "Test") -> str:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="1.0" xmlns:torznab="http://torznab.com/schemas/2015/feed">
  <channel>
    <title>{channel_title}</title>
    {item_xml}
  </channel>
</rss>"""


class TestJackettShape:
    def test_parses_jackettindexer_and_tags_attribute(self):
        xml = _wrap(
            """
            <item>
              <title>Ubuntu.24.04.LTS.iso</title>
              <size>4700000000</size>
              <pubDate>Sat, 14 Mar 2026 17:10:42 +0000</pubDate>
              <link>http://example.com/file.torrent</link>
              <comments>http://example.com/info/123</comments>
              <category>Software</category>
              <jackettindexer>RARBG</jackettindexer>
              <torznab:attr name="seeders" value="42"/>
              <torznab:attr name="peers" value="50"/>
              <torznab:attr name="tags" value="freeleech, internal"/>
            </item>
            """
        )
        results = parse_torznab_response(xml, instance_name="Jackett-1", source_type="jackett")
        assert len(results) == 1
        r = results[0]
        assert r.title == "Ubuntu.24.04.LTS.iso"
        assert r.indexer == "RARBG"
        assert r.source == "Jackett-1"
        assert r.source_type == "jackett"
        assert r.size == 4_700_000_000
        assert r.seeders == 42
        # peers (50) - seeders (42) = 8 leechers
        assert r.leechers == 8
        assert r.freeleech is True
        assert r.download_volume_factor == 0.0
        assert r.torrent_url == "http://example.com/file.torrent"
        assert r.info_url == "http://example.com/info/123"

    def test_downloadvolumefactor_zero_marks_freeleech(self):
        xml = _wrap(
            """
            <item>
              <title>Some.Release</title>
              <size>1000000</size>
              <jackettindexer>SomeIndexer</jackettindexer>
              <torznab:attr name="seeders" value="1"/>
              <torznab:attr name="peers" value="1"/>
              <torznab:attr name="downloadvolumefactor" value="0"/>
            </item>
            """
        )
        results = parse_torznab_response(xml, instance_name="J", source_type="jackett")
        assert results[0].freeleech is True
        assert results[0].download_volume_factor == 0.0


class TestProwlarrShape:
    def test_parses_prowlarrindexer_and_tag_attributes(self):
        xml = _wrap(
            """
            <item>
              <title>Some.Movie.2160p.BluRay.x265</title>
              <size>30000000000</size>
              <pubDate>Sat, 14 Mar 2026 17:10:42 +0000</pubDate>
              <link>http://prowlarr.local/12/download/abc</link>
              <comments>http://example.com/torrent/9</comments>
              <category>2040</category>
              <prowlarrindexer id="12" type="private">REDacted</prowlarrindexer>
              <torznab:attr name="seeders" value="200"/>
              <torznab:attr name="peers" value="220"/>
              <torznab:attr name="tag" value="freeleech"/>
              <torznab:attr name="tag" value="internal"/>
            </item>
            """
        )
        results = parse_torznab_response(
            xml,
            instance_name="Prowlarr-1",
            source_type="prowlarr",
            fallback_indexer="12",
        )
        assert len(results) == 1
        r = results[0]
        assert r.indexer == "REDacted"
        assert r.source_type == "prowlarr"
        assert r.size == 30_000_000_000
        assert r.seeders == 200
        assert r.leechers == 20
        assert r.freeleech is True
        assert r.download_volume_factor == 0.0
        assert r.category == "2040"

    def test_uses_fallback_indexer_when_neither_element_present(self):
        xml = _wrap(
            """
            <item>
              <title>Bare item</title>
              <size>1000</size>
              <torznab:attr name="seeders" value="0"/>
              <torznab:attr name="peers" value="0"/>
            </item>
            """
        )
        results = parse_torznab_response(
            xml,
            instance_name="P",
            source_type="prowlarr",
            fallback_indexer="42",
        )
        assert results[0].indexer == "42"

    def test_no_freeleech_when_neither_dvf_nor_tag(self):
        xml = _wrap(
            """
            <item>
              <title>Normal release</title>
              <size>1000</size>
              <prowlarrindexer id="3" type="public">PublicTracker</prowlarrindexer>
              <torznab:attr name="seeders" value="10"/>
              <torznab:attr name="peers" value="11"/>
            </item>
            """
        )
        results = parse_torznab_response(xml, instance_name="P", source_type="prowlarr")
        assert results[0].freeleech is False
        assert results[0].download_volume_factor is None


class TestRobustness:
    def test_returns_empty_for_malformed_xml(self):
        assert (
            parse_torznab_response("not xml at all", instance_name="x", source_type="jackett") == []
        )

    def test_returns_empty_when_channel_missing(self):
        xml = """<?xml version="1.0"?><rss version="1.0"></rss>"""
        assert parse_torznab_response(xml, instance_name="x", source_type="jackett") == []

    def test_skips_items_without_title(self):
        xml = _wrap(
            """
            <item><size>1</size></item>
            <item>
              <title>Has title</title>
              <size>2</size>
            </item>
            """
        )
        results = parse_torznab_response(xml, instance_name="x", source_type="jackett")
        assert len(results) == 1
        assert results[0].title == "Has title"

    def test_size_falls_back_to_torznab_attr(self):
        xml = _wrap(
            """
            <item>
              <title>Sized via attr</title>
              <torznab:attr name="size" value="123456789"/>
            </item>
            """
        )
        results = parse_torznab_response(xml, instance_name="x", source_type="jackett")
        assert results[0].size == 123_456_789


class TestErrorParsing:
    def test_parses_error_document_with_description(self):
        xml = '<?xml version="1.0"?><error code="201" description="Indexer is disabled"/>'
        assert parse_torznab_error(xml) == "Indexer is disabled (code 201)"

    def test_parses_error_document_without_code(self):
        assert parse_torznab_error('<error description="bad creds"/>') == "bad creds"

    def test_returns_none_for_regular_feed(self):
        assert parse_torznab_error(_wrap("<item><title>x</title></item>")) is None

    def test_returns_none_for_non_xml(self):
        assert parse_torznab_error("<html>nope</html>") is None
        assert parse_torznab_error("") is None

    def test_http_error_message_prefers_torznab_description(self):
        resp = httpx.Response(500, text='<error code="100" description="boom"/>')
        assert http_error_message(resp) == "boom (code 100)"

    def test_http_error_message_falls_back_to_json_message(self):
        resp = httpx.Response(400, json={"message": "Bad indexer id"})
        assert http_error_message(resp) == "Bad indexer id (HTTP 400)"

    def test_http_error_message_falls_back_to_status(self):
        resp = httpx.Response(503, text="Service Unavailable")
        assert http_error_message(resp) == "HTTP 503"
