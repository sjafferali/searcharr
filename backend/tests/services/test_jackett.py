"""Unit tests for the Jackett service helpers."""

from app.services.jackett import JackettService


class TestParseIndexersXml:
    """Tests for the Torznab ``t=indexers`` XML parser."""

    def test_parses_configured_indexer(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
        <indexers>
          <indexer id="1337x" configured="true">
            <title>1337x</title>
            <type>public</type>
          </indexer>
          <indexer id="iptorrents" configured="true">
            <title>IPTorrents</title>
            <type>private</type>
          </indexer>
        </indexers>
        """

        indexers = JackettService._parse_indexers_xml(xml)
        assert len(indexers) == 2
        assert indexers[0].id == "1337x"
        assert indexers[0].name == "1337x"
        assert indexers[0].type == "public"
        assert indexers[1].id == "iptorrents"
        assert indexers[1].type == "private"

    def test_skips_unconfigured(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
        <indexers>
          <indexer id="configured-one" configured="true">
            <title>Configured</title>
            <type>private</type>
          </indexer>
          <indexer id="not-configured" configured="false">
            <title>Disabled</title>
            <type>public</type>
          </indexer>
        </indexers>
        """

        indexers = JackettService._parse_indexers_xml(xml)
        assert len(indexers) == 1
        assert indexers[0].id == "configured-one"

    def test_handles_missing_optional_fields(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
        <indexers>
          <indexer id="bare" configured="true">
            <title>Bare Indexer</title>
          </indexer>
        </indexers>
        """

        indexers = JackettService._parse_indexers_xml(xml)
        assert len(indexers) == 1
        assert indexers[0].id == "bare"
        assert indexers[0].name == "Bare Indexer"
        assert indexers[0].type is None

    def test_returns_empty_for_malformed_xml(self):
        assert JackettService._parse_indexers_xml("not xml at all") == []

    def test_returns_empty_for_no_indexers(self):
        xml = '<?xml version="1.0" encoding="UTF-8"?><indexers></indexers>'
        assert JackettService._parse_indexers_xml(xml) == []
