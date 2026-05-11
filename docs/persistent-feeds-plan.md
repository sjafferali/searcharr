# Plan: Persistent Feed Items + Background Polling

**Status:** ready to implement
**Estimated scope:** ~6–8 new source files, ~6 modified. ~600 lines backend + tests, ~400 lines frontend. One Alembic migration. No new runtime dependencies.

---

## 1. Background and Goal

### What exists today

Searcharr has a **Feeds** page (`frontend/src/pages/FeedsPage.tsx`). A "feed" is a saved set of `(indexer_instance, indexer_id)` references plus optional result-shaping filters (freeleech-only, min seeders, size bounds, regex include/exclude). The UI lets the user pick a feed, click **Refresh**, and see the latest items.

The current fetch path is **on-demand and stateless**:

- `POST /api/v1/feeds/{id}/fetch` triggers `FeedService.fetch()` (`backend/app/services/feed.py`).
- That dispatches one Newznab passthrough call per Prowlarr indexer (`ProwlarrService.get_latest`) and one Torznab call per Jackett instance (`JackettService.get_latest`), all with empty query strings.
- Results are filtered by the feed's filters and either sorted by `pubDate desc` (default) or concatenated in indexer order (the `sort_strategy` we added recently).
- The response is rendered live. Nothing is persisted between fetches.

### Why this is being changed

Indexer-level RSS/browse endpoints return a small fixed window — typically 50 items per call, sometimes 100, with no offset pagination on most Cardigann YAMLs. On a fast-moving tracker this window can cover only a few hours of history. The user's primary use case (catching freeleech windows on private trackers) needs more depth than the live window provides: freeleech items can appear sporadically over days and fall off the window long before the user opens the page.

Prowlarr itself is **stateless by design**: its `History` table tracks query/grab *events*, not release payloads. The intended consumer model is a polling client (Sonarr, Radarr, etc.) that maintains its own state and matches incoming items against a watchlist. Searcharr's feed use case is browse-style discovery, which doesn't fit that model — there's no watchlist, just "show me everything freeleech the tracker has surfaced recently."

The fix is to make **Searcharr** the polling consumer: poll each feed in the background, persist every distinct item into a `feed_items` table keyed by `dedup_key`, and serve the UI from accumulated history. The freeleech filter (and every other filter) then applies across that wider window, not just the current 50-item snapshot.

Important honesty caveat: Prowlarr does **not** expose freeleech end-time anywhere. `downloadvolumefactor` and `IndexerFlags` are point-in-time snapshots. The only way to know an item left freeleech is to re-observe it. So:

- For items still in the upstream window: each poll refreshes their `freeleech` and seeders/leechers.
- For items that have aged out of the window: we hold the last-observed state and display a freshness indicator so the user knows the data is historical.

### What this is NOT

Out of scope (could be follow-ups):

- Push notifications for new freeleech items
- Per-item active re-verification (searching by GUID/title to re-check freeleech)
- Cross-feed dedup (items in two feeds = two `feed_items` rows; intentional)
- Backup/export of `feed_items`

---

## 2. Relevant existing code (read these first)

### Backend

| File | What's in it |
|---|---|
| `backend/app/models/feed.py` | `Feed` and `FeedIndexer` SQLAlchemy models. |
| `backend/app/schemas/feed.py` | Pydantic schemas: `FeedFilters`, `FeedIndexerRef`, `FeedCreate`, `FeedUpdate`, `FeedResponse`, `FeedListResponse`, `FeedFetchResponse`, `FeedSortStrategy` enum. |
| `backend/app/services/feed.py` | `FeedService` with `.fetch(feed)` that dispatches to Jackett/Prowlarr and applies filters + sort. **Reuse this for the polling-side fetch — do NOT rewrite.** |
| `backend/app/services/jackett.py` | `JackettService.get_latest()` |
| `backend/app/services/prowlarr.py` | `ProwlarrService.get_latest()` (per-indexer Newznab passthrough) |
| `backend/app/services/bookmark.py` | `compute_dedup_key()` — the canonical dedup-key computation. **Use this for `feed_items.dedup_key`.** |
| `backend/app/api/v1/feeds.py` | All feed CRUD endpoints. `_serialize`, `_replace_indexers`, `_apply_filters_to_feed` patterns to follow. |
| `backend/app/api/v1/router.py` | Where new routers are wired. |
| `backend/app/main.py` | App lifespan — where the poller task starts/stops. |
| `backend/alembic/versions/006_add_feeds.py`<br>`backend/alembic/versions/007_add_feed_sort_strategy.py` | Migration patterns to follow, including the **idempotency guard** pattern (skip create if table/column already exists — necessary because some deployments materialize tables via `create_all` outside of Alembic). |

### Frontend

| File | What's in it |
|---|---|
| `frontend/src/types/feed.ts` | `Feed`, `FeedFilters`, `FeedIndexerRef`, `FeedCreate`, `FeedUpdate`, `FeedFetchResponse`, `FeedSortStrategy`. |
| `frontend/src/api/feeds.ts` | API client for feed CRUD + fetch. |
| `frontend/src/hooks/useFeeds.ts` | React Query hooks: `useFeeds`, `useFeed`, `useCreateFeed`, `useUpdateFeed`, `useDeleteFeed`, `useFeedFetch`. |
| `frontend/src/pages/FeedsPage.tsx` | The page being redesigned. |
| `frontend/src/components/modals/FeedEditorModal.tsx` | The create/edit modal getting a new "Polling" section. |
| `frontend/src/pages/SearchPage.tsx` | Reference for the **column-header sort/filter UI pattern** — the new sortable Seen / Added columns should mirror its `SortableTh` + `ColumnFilter` approach. |
| `frontend/src/components/ColumnFilter.tsx` | The column-header filter popover used by SearchPage. Reuse it on FeedsPage. |
| `frontend/src/utils/format.ts` | `formatAge` (compact relative time), `formatDateTime` (absolute), `formatRelative` (`Intl.RelativeTimeFormat`). |

### Tests

| File | Pattern |
|---|---|
| `backend/tests/api/test_feeds.py` | API-level test pattern. Uses `_payload` helper, `httpx.AsyncClient` fixture. |
| `backend/tests/services/test_feed.py` | Service-level tests; `TestSortStrategy` class shows how to mock `_fetch_jackett`/`_fetch_prowlarr` with `AsyncMock` to test the merge/sort logic without hitting real HTTP. |
| `backend/tests/conftest.py` | `client`, `db_session`, `jackett_instance`, `prowlarr_instance` fixtures. |

### Background context

- Migrations 005 and 006 have an **idempotency guard** (skip-if-table-exists) because production deployments may have had `create_all` materialize tables outside of Alembic before we ran migrations cleanly. New migrations should keep this pattern.
- `create_all` has been removed from `app/main.py` lifespan (post-005/006 cleanup). Alembic is now the only schema source. Tests still use `create_all` via `conftest.py:39` (out of band, fine).
- Existing CI venv does NOT have `respx`. HTTP mocking uses `httpx.MockTransport` + `unittest.mock.patch` (see `backend/tests/services/test_prowlarr.py` for the pattern, especially the **bind-real-class-before-patch trick** to avoid recursion).
- Pydantic v2 is in use; `field_validator` is the decorator.
- The codebase uses Python 3.11 syntax (`str | None`, `from datetime import UTC`).

---

## 3. Settled design decisions

| # | Decision | Value |
|---|---|---|
| 1 | Default poll interval | 15 minutes, per-feed configurable, **min 5, max 1440** |
| 2 | Default retention | 30 days, per-feed configurable, **min 1, max 365** |
| 3 | Stale cutoff (when to dim a row) | `max(60 minutes, poll_interval × 4)`. Computed server-side and returned in `FeedItemListResponse` as `stale_after_seconds` so the frontend doesn't duplicate the formula. |
| 4 | Manual refresh updates `last_polled_at` | Yes — manual refresh resets the polling clock; scheduled poller respects it. |
| 5 | Per-feed `polling_enabled` toggle | Yes — disabled feeds skip polling but retain history and can still be manually refreshed. |
| 6 | Default sort in FeedsPage | `last_seen desc` (previously `pub_date desc`). The natural order for a polled history is "most recently observed first." |
| 7 | Existing `POST /feeds/{id}/fetch` | Keep as a backward-compat alias for `POST /feeds/{id}/refresh`. Both run a synchronous poll and return items. |

---

## 4. Schema and migration

### 4.1 `feeds` columns to add

```python
poll_interval_minutes: Mapped[int] = mapped_column(
    Integer, nullable=False, default=15, server_default="15"
)
retention_days: Mapped[int] = mapped_column(
    Integer, nullable=False, default=30, server_default="30"
)
polling_enabled: Mapped[bool] = mapped_column(
    Boolean, nullable=False, default=True, server_default=sa.true()  # in the migration
)
last_polled_at: Mapped[datetime | None] = mapped_column(
    DateTime(timezone=True), nullable=True
)
```

Server defaults so existing rows back-fill cleanly. **Use `sa.true()` / `sa.false()` for boolean defaults — `sa.text("0")` fails on Postgres** (this bit us in migration 006).

### 4.2 New `feed_items` table

```python
class FeedItem(BaseModel):
    __tablename__ = "feed_items"
    __table_args__ = (
        UniqueConstraint("feed_id", "dedup_key", name="uq_feed_item_dedup"),
        Index("ix_feed_items_feed_last_seen", "feed_id", "last_seen_at"),
        Index("ix_feed_items_feed_first_seen", "feed_id", "first_seen_at"),
        Index("ix_feed_items_feed_freeleech", "feed_id", "freeleech"),
    )

    feed_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("feeds.id", ondelete="CASCADE"), nullable=False, index=True
    )
    dedup_key: Mapped[str] = mapped_column(String(255), nullable=False)

    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Denormalized SearchResult payload
    title: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[str] = mapped_column(String(16), nullable=False)
    source_instance_name: Mapped[str] = mapped_column(String(255), nullable=False)
    indexer: Mapped[str] = mapped_column(String(255), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    seeders: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    leechers: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pub_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    magnet_link: Mapped[str | None] = mapped_column(Text, nullable=True)
    torrent_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    info_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    freeleech: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    download_volume_factor: Mapped[float | None] = mapped_column(Float, nullable=True)
```

Add to `backend/app/models/__init__.py` exports, and to `backend/alembic/env.py`'s model import block.

### 4.3 Migration `008_add_feed_items.py`

Path: `backend/alembic/versions/008_add_feed_items.py`. Revises `007_add_feed_sort_strategy`.

Follow the pattern from `006_add_feeds.py`:

- `_table_exists(name)` helper guarded skip
- `_column_exists(table, column)` helper for the `feeds` ALTER columns (mirror `007_add_feed_sort_strategy.py`)
- `upgrade()`: add four columns to `feeds` (each guarded), then create `feed_items` (guarded)
- `downgrade()`: drop `feed_items`, drop the four columns (each guarded)

Verify it runs cleanly on a fresh SQLite DB:

```bash
rm -f /tmp/test.db && cd backend && \
  DATABASE_TYPE=sqlite SQLITE_DATABASE_PATH=/tmp/test.db \
  poetry run alembic upgrade head
```

---

## 5. Backend — services

### 5.1 `FeedPoller` (`backend/app/services/feed_poller.py`)

A single asyncio task started in app lifespan. Owns the polling loop and the retention sweep.

**Behavior:**

```python
class FeedPoller:
    POLL_TICK_SECONDS = 30
    CONCURRENT_FEED_POLLS = 3
    RETENTION_INTERVAL_SECONDS = 86_400  # daily

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory
        self._stop = asyncio.Event()
        self._semaphore = asyncio.Semaphore(self.CONCURRENT_FEED_POLLS)
        self._last_retention_at: datetime | None = None

    async def run_forever(self) -> None:
        while not self._stop.is_set():
            try:
                await self._tick()
            except Exception:
                logger.exception("FeedPoller tick failed; continuing")
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self.POLL_TICK_SECONDS)
            except asyncio.TimeoutError:
                pass  # normal — woke up to do another tick

    def stop(self) -> None:
        self._stop.set()

    async def _tick(self) -> None:
        async with self._session_factory() as session:
            due_feeds = await self._load_due_feeds(session)
        if due_feeds:
            await asyncio.gather(*(self._poll_one(fid) for fid in due_feeds))
        await self._maybe_run_retention()
```

**Key responsibilities:**

1. `_load_due_feeds(session)` — query `Feed.id` where `polling_enabled = true` AND (`last_polled_at IS NULL` OR `last_polled_at < now - poll_interval_minutes`). Return ids only (each poll opens its own session).

2. `_poll_one(feed_id)` — acquire semaphore, open fresh session, `selectinload(Feed.indexers)`, call existing `FeedService(session).fetch(feed)`, upsert results into `feed_items`, set `feed.last_polled_at = now`, commit.

3. `_upsert_items(session, feed_id, results)` — for each `SearchResult`:
   - Compute `dedup_key` via `compute_dedup_key()` from `backend/app/services/bookmark.py`. **Skip items without a dedup key** (can't track them).
   - `SELECT FROM feed_items WHERE feed_id=? AND dedup_key=?`
   - If exists: update mutable fields (`last_seen_at`, `freeleech`, `download_volume_factor`, `seeders`, `leechers`, `size_bytes`, `title` in case it changed). Leave `first_seen_at` alone.
   - If new: insert with `first_seen_at = last_seen_at = now`.
   - Use SQLAlchemy `select` + insert/update (avoid Postgres-specific `INSERT ... ON CONFLICT` to keep SQLite compatibility — Alembic and prod both run on Postgres but tests run on SQLite).

4. `_maybe_run_retention()` — if `_last_retention_at` is None or `< now - RETENTION_INTERVAL_SECONDS`, run a sweep: for each feed, `DELETE FROM feed_items WHERE feed_id = ? AND last_seen_at < now - feed.retention_days`. Update `_last_retention_at`.

5. **Manual refresh path** (used by the API endpoint, see §6) calls `_upsert_items` directly via a public helper `await poller.refresh_now(feed_id)`. This sets `last_polled_at = now` so the scheduler skips this feed for its next interval.

**Lifespan integration** (`backend/app/main.py`):

```python
from app.core.database import get_session_factory
from app.services.feed_poller import FeedPoller

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Starting up application...")
    engine = get_engine()

    poller = FeedPoller(get_session_factory())
    poller_task = asyncio.create_task(poller.run_forever())
    app.state.feed_poller = poller  # so API endpoints can call .refresh_now()

    logger.info("Application started successfully")
    try:
        yield
    finally:
        logger.info("Shutting down application...")
        poller.stop()
        try:
            await asyncio.wait_for(poller_task, timeout=10)
        except asyncio.TimeoutError:
            poller_task.cancel()
        await engine.dispose()
```

Add the poller to `backend/app/services/__init__.py` exports.

### 5.2 Computing `stale_after_seconds`

Put this on `Feed` as a Python property (not stored):

```python
@property
def stale_after_seconds(self) -> int:
    return max(3600, self.poll_interval_minutes * 60 * 4)
```

Or compute in the API serializer — either works. The frontend uses this to decide row dimming.

---

## 6. Backend — schemas and API

### 6.1 Schema additions (`backend/app/schemas/feed.py`)

```python
class FeedCreate(BaseSchema):
    # ... existing fields ...
    poll_interval_minutes: int = Field(15, ge=5, le=1440)
    retention_days: int = Field(30, ge=1, le=365)
    polling_enabled: bool = Field(True)


class FeedUpdate(BaseSchema):
    # ... existing fields ...
    poll_interval_minutes: int | None = Field(None, ge=5, le=1440)
    retention_days: int | None = Field(None, ge=1, le=365)
    polling_enabled: bool | None = None


class FeedResponse(BaseSchema):
    # ... existing fields ...
    poll_interval_minutes: int
    retention_days: int
    polling_enabled: bool
    last_polled_at: datetime | None
    stale_after_seconds: int


class FeedItemSortBy(str, Enum):
    LAST_SEEN = "last_seen"
    FIRST_SEEN = "first_seen"
    PUB_DATE = "pub_date"
    SEEDERS = "seeders"
    SIZE = "size"
    TITLE = "title"


class FeedItem(BaseSchema):
    # Mirror SearchResult fields ...
    id: int                                # feed_items.id
    first_seen_at: datetime
    last_seen_at: datetime
    title: str
    source: str                            # = source_instance_name (matches SearchResult.source)
    source_type: Literal["jackett", "prowlarr"]
    indexer: str
    size: int                              # = size_bytes (matches SearchResult.size)
    size_formatted: str                    # computed via format_size
    seeders: int
    leechers: int
    date: datetime | None                  # = pub_date (matches SearchResult.date)
    category: str
    magnet_link: str | None
    torrent_url: str | None
    info_url: str | None
    freeleech: bool
    download_volume_factor: float | None
    dedup_key: str                         # so the frontend can dedup with bookmarks/history


class FeedItemListResponse(BaseSchema):
    total: int                             # total items matching filter (for pagination)
    entries: list[FeedItem]
    feed_id: int
    feed_name: str
    last_polled_at: datetime | None
    next_poll_at: datetime | None          # last_polled_at + poll_interval_minutes if enabled, else null
    stale_after_seconds: int               # for client-side row dimming
    polling_enabled: bool
```

**Note the field naming**: `FeedItem` keeps the existing `SearchResult` field names (`source`, `size`, `date`) so the existing frontend row-renderer keeps working without per-field adapters.

Re-export `FeedItem`, `FeedItemListResponse`, `FeedItemSortBy` from `backend/app/schemas/__init__.py`.

### 6.2 API endpoints (`backend/app/api/v1/feeds.py`)

```python
@router.get("/{feed_id}/items", response_model=FeedItemListResponse)
async def list_feed_items(
    feed_id: int,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    sort_by: Annotated[FeedItemSortBy, Query()] = FeedItemSortBy.LAST_SEEN,
    sort_order: Annotated[SortOrder, Query()] = SortOrder.DESC,
    freeleech_only: Annotated[bool, Query()] = False,
    min_seeders: Annotated[int, Query(ge=0)] = 0,
    min_size_bytes: Annotated[int | None, Query(ge=0)] = None,
    max_size_bytes: Annotated[int | None, Query(ge=0)] = None,
    seen_within_hours: Annotated[int | None, Query(ge=1)] = None,
    first_seen_within_hours: Annotated[int | None, Query(ge=1)] = None,
    db: AsyncSession = Depends(get_db),
) -> FeedItemListResponse:
    ...
```

Build the query incrementally with each `WHERE` clause guarded by the param. Sort key mapping:

```python
SORT_COLUMNS = {
    FeedItemSortBy.LAST_SEEN: FeedItemModel.last_seen_at,
    FeedItemSortBy.FIRST_SEEN: FeedItemModel.first_seen_at,
    FeedItemSortBy.PUB_DATE: FeedItemModel.pub_date,
    FeedItemSortBy.SEEDERS: FeedItemModel.seeders,
    FeedItemSortBy.SIZE: FeedItemModel.size_bytes,
    FeedItemSortBy.TITLE: FeedItemModel.title,
}
```

```python
@router.post("/{feed_id}/refresh", response_model=FeedItemListResponse)
async def refresh_feed(
    feed_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> FeedItemListResponse:
    poller: FeedPoller = request.app.state.feed_poller
    await poller.refresh_now(feed_id)
    # Then return the now-updated item list (default params)
    return await list_feed_items(feed_id, ..., db=db)
```

Keep the existing `POST /{feed_id}/fetch` endpoint but make it an alias:

```python
@router.post("/{feed_id}/fetch", response_model=FeedItemListResponse)
async def fetch_feed_legacy(...):
    return await refresh_feed(...)
```

(Or just register both routes against the same handler.)

Update `create_feed` and `update_feed` to handle the new fields:

```python
feed = Feed(
    name=payload.name.strip(),
    description=payload.description,
    sort_strategy=payload.sort_strategy.value,
    poll_interval_minutes=payload.poll_interval_minutes,
    retention_days=payload.retention_days,
    polling_enabled=payload.polling_enabled,
)
```

Update `_serialize` to populate `last_polled_at` and `stale_after_seconds`.

---

## 7. Backend tests

Follow the patterns in `backend/tests/api/test_feeds.py` and `backend/tests/services/test_feed.py`.

### Tests to add

**`test_feeds.py` (API-level):**

1. `test_create_feed_with_polling_fields` — defaults are 15/30/true; explicit values round-trip.
2. `test_create_feed_rejects_out_of_range_polling` — `poll_interval_minutes=2` → 422; `retention_days=0` → 422.
3. `test_update_feed_polling_fields` — change interval, retention, enabled — round-trip.
4. `test_list_items_pagination_sort_filter` — manually `INSERT` a handful of `feed_items` via the session fixture, then hit `GET /items` with various sort/filter combinations and assert ordering / pagination.
5. `test_list_items_seen_within_hours_filter` — only items with `last_seen_at > now-N` come back.
6. `test_refresh_endpoint_triggers_poll` — mock `FeedPoller.refresh_now` (attach a fake poller to `app.state`), confirm it's called and the items endpoint runs after.

**`test_feed_poller.py` (new service-level):**

1. `test_due_feeds_query` — feeds with `last_polled_at = None` are due; feeds polled recently are not.
2. `test_disabled_feeds_skipped` — `polling_enabled=False` feeds are never returned by `_load_due_feeds`.
3. `test_upsert_idempotent` — polling twice with the same item updates `last_seen_at`, leaves `first_seen_at` unchanged.
4. `test_upsert_skips_items_without_dedup_key` — synthesize a result with no magnet/torrent/info URL; `_upsert_items` doesn't insert.
5. `test_upsert_updates_mutable_fields` — second poll with different `freeleech`/`seeders` values updates the row.
6. `test_retention_sweep_drops_old_items` — insert items with `last_seen_at` older than retention window; sweep drops them; recent items survive.
7. `test_refresh_now_updates_last_polled_at` — manual refresh resets the clock.

Use the `db_session` fixture from `conftest.py`. For mocking `FeedService.fetch`, follow the `AsyncMock` pattern from `test_feed.py::TestSortStrategy`.

---

## 8. Frontend — types, API, hooks

### 8.1 Types (`frontend/src/types/feed.ts`)

```typescript
export interface Feed {
  // ... existing fields ...
  poll_interval_minutes: number
  retention_days: number
  polling_enabled: boolean
  last_polled_at: string | null
  stale_after_seconds: number
}

export interface FeedCreate {
  // ... existing fields ...
  poll_interval_minutes?: number
  retention_days?: number
  polling_enabled?: boolean
}

export interface FeedUpdate {
  // ... existing fields ...
  poll_interval_minutes?: number
  retention_days?: number
  polling_enabled?: boolean
}

export type FeedItemSortBy = 'last_seen' | 'first_seen' | 'pub_date' | 'seeders' | 'size' | 'title'

export interface FeedItem extends SearchResult {
  first_seen_at: string
  last_seen_at: string
  dedup_key: string
}

export interface FeedItemListParams {
  limit?: number
  offset?: number
  sort_by?: FeedItemSortBy
  sort_order?: SortOrder
  freeleech_only?: boolean
  min_seeders?: number
  min_size_bytes?: number
  max_size_bytes?: number
  seen_within_hours?: number
  first_seen_within_hours?: number
}

export interface FeedItemListResponse {
  total: number
  entries: FeedItem[]
  feed_id: number
  feed_name: string
  last_polled_at: string | null
  next_poll_at: string | null
  stale_after_seconds: number
  polling_enabled: boolean
}
```

### 8.2 API (`frontend/src/api/feeds.ts`)

```typescript
items: async (id: number, params: FeedItemListParams = {}): Promise<FeedItemListResponse> => {
  const qs = new URLSearchParams()
  // ... append params ...
  const response = await api.get<FeedItemListResponse>(`/feeds/${id}/items?${qs}`)
  return response.data
},

refresh: async (id: number): Promise<FeedItemListResponse> => {
  const response = await api.post<FeedItemListResponse>(`/feeds/${id}/refresh`)
  return response.data
},
```

### 8.3 Hooks (`frontend/src/hooks/useFeeds.ts`)

```typescript
export function useFeedItems(id: number | null, params: FeedItemListParams) {
  return useQuery({
    queryKey: feedKeys.items(id ?? -1, params),
    queryFn: () => feedsApi.items(id as number, params),
    enabled: id !== null,
    refetchInterval: 30_000,        // 30s background refresh
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  })
}

export function useRefreshFeed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => feedsApi.refresh(id),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: feedKeys.items(id) })
      toast.success(`Polled — ${data.total} items in history`)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Refresh failed')
    },
  })
}
```

Add `feedKeys.items(id, params)` to the existing `feedKeys` object.

Remove (or keep for back-compat) `useFeedFetch`. The FeedsPage replaces its use with `useFeedItems`.

---

## 9. Frontend — `FeedEditorModal` polling section

Insert as a new section after the existing Filters block. Visual parallel: same shell as the Filters section (`rounded-xl border border-slate-800/60 bg-slate-900/40 p-3`), same header style.

```tsx
<section className="space-y-3 rounded-xl border border-slate-800/60 bg-slate-900/40 p-3">
  <header className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
    <Radio className="h-3.5 w-3.5 text-cyan-400" />
    Polling
  </header>

  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-800/60 bg-slate-900/60 px-3 py-2.5 transition-colors hover:border-cyan-500/40">
    <input
      type="checkbox"
      checked={pollingEnabled}
      onChange={(e) => setPollingEnabled(e.target.checked)}
      className="h-4 w-4 cursor-pointer accent-cyan-500"
    />
    <div>
      <p className="text-xs font-semibold text-slate-200">Enabled</p>
      <p className="mt-0.5 text-[11px] text-slate-500">
        Searcharr polls in the background and remembers every item it sees, so freeleech windows aren't missed while you're away.
      </p>
    </div>
  </label>

  <div className="grid gap-3 sm:grid-cols-2">
    <div>
      <label className="...">Refresh every</label>
      <div className="flex items-center gap-2">
        <input type="number" min={5} max={1440} value={pollInterval} ... className="input flex-1" />
        <span className="text-xs text-slate-400">minutes</span>
      </div>
      <p className="...">Between 5 and 1440 minutes (24h).</p>
    </div>

    <div>
      <label className="...">Retain history for</label>
      <div className="flex items-center gap-2">
        <input type="number" min={1} max={365} value={retention} ... className="input flex-1" />
        <span className="text-xs text-slate-400">days</span>
      </div>
      <p className="...">Older items are pruned automatically.</p>
    </div>
  </div>

  {feed?.last_polled_at && (
    <p className="text-[11px] text-slate-500">
      Last polled {formatRelative(feed.last_polled_at)}
    </p>
  )}
</section>
```

Wire `pollingEnabled`, `pollInterval`, `retention` into the existing state-reset `useEffect`, the `handleSave` payload, and validate they're within bounds before submit. Add a toast on the boundary errors.

Use `Radio` from `lucide-react` (the antenna-looking icon) or `Activity` or `Radar` — your call for icon, but keep it visually distinct from the `Rss` icon used in the modal title.

---

## 10. Frontend — `FeedsPage` redesign

This is the biggest UI change. Read the current `FeedsPage.tsx` end-to-end first to understand the existing layout.

### 10.1 Header card changes

Currently shows: feed name, filter chips, indexer chips, `Refresh` / Edit / Delete buttons, `Fetched X ago from N instances`.

New version replaces the fetched line with **polling status**:

```
🌀 My Feed                                  [Refresh now]  [✎]  [🗑]
   [Freeleech only] [+5 seeders] [Movies]
   [GAYtorrent.ru (fixed dates)] [Gay-Torrents.net] [+1 more]
   ┌─────────────────────────────────────────────────────────┐
   │ 📡 Polling every 15m  •  Last poll: 3m ago              │
   │ Next poll: in 12m  •  1,247 items in history            │
   └─────────────────────────────────────────────────────────┘
```

If `polling_enabled` is false: show "Polling: paused" in amber tone instead.

The "in flight" indicator: when `useRefreshFeed.isPending` is true, pulse the `📡` icon (a `Radar` or `Activity` Lucide icon with `animate-pulse`).

### 10.2 Filters bar above the table

A small row of controls:

- **Show stale** toggle (default on) — corresponds to `seen_within_hours` filter param. When off, sends `seen_within_hours = stale_after_seconds / 3600`.
- Result count: `1,247 items` (total from response) with `(123 hidden by filters)` when filters reduce it.
- Existing column-header filter UI for size / seeders / etc. carries over.

### 10.3 Table columns and sorting

Use the `SortableTh` component pattern from `SearchPage.tsx`. New column layout:

| # | Column | Sortable? | Sort key | Filterable popover? |
|---|---|---|---|---|
| 1 | Title (with freshness dot before title) | Yes (asc) | `title` | — |
| 2 | Source | No | — | — |
| 3 | Size | Yes (desc) | `size` | "Max size" (existing pattern) |
| 4 | S/L | Yes (desc) | `seeders` | "Min seeders" (existing pattern) |
| 5 | Age (pub_date) | Yes (desc) | `pub_date` | — |
| 6 | **Seen (new)** | Yes (desc, **default**) | `last_seen` | "Seen within last [N hours]" |
| 7 | **Added (new)** | Yes (desc) | `first_seen` | "First seen within last [N hours]" |
| 8 | Actions | — | — | — |

Default sort: `last_seen desc`.

### 10.4 Freshness dot

A small colored dot (`h-2 w-2 rounded-full`) before the title, with tooltip showing exact `last_seen_at`:

```tsx
function freshnessTone(item: FeedItem, staleAfterSeconds: number) {
  const ageSec = (Date.now() - new Date(item.last_seen_at).getTime()) / 1000
  if (ageSec < 1800) return 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]'  // fresh: bright cyan with glow
  if (ageSec < staleAfterSeconds) return 'bg-slate-400'                          // recent: slate
  return 'bg-slate-700'                                                          // stale: muted
}
```

Row opacity: stale items get `opacity-60`, return to full on hover. Don't hide them — let the user see them but visually de-emphasize. The "Show stale" toggle is for users who want to hide them entirely.

### 10.5 Seen / Added column rendering

```tsx
<td className="px-4 py-3 text-sm text-slate-400">
  <div
    className="flex items-center gap-1.5"
    title={`Seen: ${formatDateTime(item.last_seen_at)}\nFirst seen: ${formatDateTime(item.first_seen_at)}`}
  >
    <Eye className="h-3.5 w-3.5" />
    {formatAge(item.last_seen_at)}
  </div>
</td>
```

`formatAge` already handles the compact `5m`/`3.4h`/`5d` format.

### 10.6 Pagination ("Load more")

Below the table:

```tsx
{entries.length < total && (
  <button
    onClick={() => setOffset(offset + 100)}
    className="..."
  >
    Load more ({total - entries.length} remaining)
  </button>
)}
```

Use a state for `offset`; pass `offset` and `limit=100` to `useFeedItems`. When `offset` changes, the `useQuery` refetches with the new offset. Concatenate entries client-side, or refetch from offset=0 each time the filter changes (simpler — recommend this approach).

Reset offset to 0 whenever filters change.

### 10.7 Live updates

Because `useFeedItems` has `refetchInterval: 30_000`, the page updates on its own every 30s as the poller picks up new items in the background. No spinner needed — just let new rows appear at the top. Consider a subtle "fade-in" animation on newly-arrived rows (use the existing `animate-fade-in` Tailwind utility we already use elsewhere).

### 10.8 Visual styling — tokens to reuse

Stay in the existing design vocabulary:

- Card shells: `rounded-xl border border-slate-800/50 bg-slate-900/50`
- Cyan = active/live: `text-cyan-400`, `bg-cyan-500/10`, `border-cyan-500/30`
- Emerald = success/freeleech: `text-emerald-300`, `bg-emerald-500/10`
- Rose = errors/dead torrents
- Slate gradients on inactive elements
- Icons from `lucide-react` (already a dependency)
- Animation utilities: `animate-fade-in`, `animate-pulse`

---

## 11. Verification

After implementation, run in order:

```bash
# Backend
cd backend
poetry run pytest                                  # expect green
poetry run mypy app/                               # expect "Success: no issues found"
poetry run ruff check app/ tests/                  # expect clean

# Fresh DB migration test
rm -f /tmp/test.db
DATABASE_TYPE=sqlite SQLITE_DATABASE_PATH=/tmp/test.db poetry run alembic upgrade head

# Polluted-state migration test (simulating existing deploy where tables were create_all'd):
# - Migrate to 007
# - Manually CREATE TABLE feed_items via sqlite3
# - Run alembic upgrade head — must skip create_table without erroring

# Frontend
cd frontend
npx tsc --noEmit                                   # expect silent (no errors)
npm run lint                                       # expect clean
npm run build                                      # expect successful build
```

**Manual E2E:**

1. Start backend + frontend dev servers locally pointed at the user's live Prowlarr / Jackett.
2. Create a new feed pointing at the Prowlarr GAYtorrent.ru (fixed dates) indexer.
3. Watch the poller log every 30s; after a few cycles, items should accumulate in `feed_items`.
4. Open the FeedsPage; verify items appear, freshness dot reflects last_seen_at, header shows correct poll cadence.
5. Click "Refresh now" — verify items list updates, `last_polled_at` resets.
6. Toggle freeleech-only, sort by Seen/Added — verify behaviors.
7. Edit the feed → change poll interval to 5 minutes → save → verify subsequent polls run on the new cadence.
8. Disable polling → verify scheduler skips the feed, manual refresh still works.
9. Wait long enough (or temporarily set retention_days=0 + tick the poller) to confirm retention sweep drops items.

---

## 12. Suggested commit order

For sane review/rollback if something goes sideways:

1. Migration + model + schemas (no behavior change yet)
2. FeedPoller service + tests (still no API surface)
3. API endpoints (items + refresh) + tests
4. Lifespan integration (poller starts on app boot)
5. Frontend types + API client + hooks
6. FeedEditorModal polling section
7. FeedsPage redesign

Each commit should pass tests independently if possible.

---

## 13. Things to watch for during implementation

- **Pydantic field naming**: `FeedItem` keeps `source` (not `source_instance_name`) and `size` (not `size_bytes`) and `date` (not `pub_date`) to match the existing `SearchResult` shape, so the existing frontend row renderer keeps working unchanged.
- **`compute_dedup_key` may return None**: items without any magnet/torrent/info URL — skip them on upsert.
- **`last_seen_at` index is critical**: default sort is by it, retention scans by it. Don't forget the composite `(feed_id, last_seen_at)` index.
- **Don't lazy-load `feed.indexers` from inside the poller's async loop without `selectinload`**: same gotcha that bit us in the bookmarks lookup work. Always eager-load.
- **Pydantic v2 `default_factory` typing quirk** (`feed.py` already has a workaround): mypy complains about `default_factory=FeedFilters`. Use `default_factory=lambda: FeedFilters(...)` with explicit args.
- **Migration idempotency**: existing live deploys may have `feed_items` materialized by some other means. Always wrap creates in `_table_exists` checks.
- **`sa.true()` not `sa.text("0")`** for boolean defaults (Postgres-safe).
- **CI venv lacks `respx`**: HTTP mocking uses `httpx.MockTransport` + `unittest.mock.patch` with the bind-real-class-before-patch trick. See `backend/tests/services/test_prowlarr.py` for the exact pattern.

---

## 14. Open questions left for the implementer

None expected at this point — all design decisions are settled. If something ambiguous comes up:

- **Concurrency cap on poller** (currently 3): change if you have reason to. 3 is conservative; trackers won't notice.
- **Tick frequency** (currently 30s): can drop to 60s without much UX impact if it shows up in CPU profiles.
- **Auto-refresh interval on frontend** (currently 30s): match the poller tick frequency or set to half of it.
