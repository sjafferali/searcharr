# Searcharr API Reference

This document provides a comprehensive reference for the Searcharr backend API.
Frontend developers should use this as the primary reference for integrating with the backend.

## Base URL

```
/api/v1
```

## Authentication

Currently, the API does not require authentication. This may change in future versions.

## Response Format

All responses are in JSON format. Successful responses return the appropriate data, while errors return:

```json
{
  "detail": "Error message here"
}
```

## Endpoints Overview

| Category | Endpoint | Method | Description |
|----------|----------|--------|-------------|
| Instances | `/instances/jackett` | GET | List all Jackett instances |
| Instances | `/instances/jackett` | POST | Create Jackett instance |
| Instances | `/instances/jackett/{id}` | GET | Get Jackett instance |
| Instances | `/instances/jackett/{id}` | PUT | Update Jackett instance |
| Instances | `/instances/jackett/{id}` | DELETE | Delete Jackett instance |
| Instances | `/instances/jackett/{id}/test` | POST | Test Jackett connection |
| Instances | `/instances/prowlarr` | GET | List all Prowlarr instances |
| Instances | `/instances/prowlarr` | POST | Create Prowlarr instance |
| Instances | `/instances/prowlarr/{id}` | GET | Get Prowlarr instance |
| Instances | `/instances/prowlarr/{id}` | PUT | Update Prowlarr instance |
| Instances | `/instances/prowlarr/{id}` | DELETE | Delete Prowlarr instance |
| Instances | `/instances/prowlarr/{id}/test` | POST | Test Prowlarr connection |
| Instances | `/instances/status` | GET | Get all instances with status |
| Clients | `/clients` | GET | List all download clients |
| Clients | `/clients` | POST | Create download client |
| Clients | `/clients/{id}` | GET | Get download client |
| Clients | `/clients/{id}` | PUT | Update download client |
| Clients | `/clients/{id}` | DELETE | Delete download client |
| Clients | `/clients/{id}/test` | POST | Test client connection |
| Clients | `/clients/status/all` | GET | Get all clients with status |
| Search | `/search` | GET | Execute unified search |
| Search | `/search/categories` | GET | Get available categories |
| Download | `/download` | POST | Send torrent to client |

---

## Instances API

### Jackett Instances

#### List Jackett Instances

```
GET /api/v1/instances/jackett
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "Jackett Primary",
    "url": "http://192.168.1.100:9117",
    "api_key": "abc1...def4",
    "created_at": "2025-01-31T10:00:00Z",
    "updated_at": "2025-01-31T10:00:00Z"
  }
]
```

#### Create Jackett Instance

```
POST /api/v1/instances/jackett
Content-Type: application/json

{
  "name": "My Jackett",
  "url": "http://192.168.1.100:9117",
  "api_key": "your-api-key-here"
}
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Display name (1-255 chars) |
| url | string | Yes | Jackett server URL |
| api_key | string | Yes | Jackett API key |

**Response:** `201 Created`
```json
{
  "id": 1,
  "name": "My Jackett",
  "url": "http://192.168.1.100:9117",
  "api_key": "your...here",
  "created_at": "2025-01-31T10:00:00Z",
  "updated_at": "2025-01-31T10:00:00Z"
}
```

#### Get Jackett Instance

```
GET /api/v1/instances/jackett/{id}
```

**Response:** `200 OK` or `404 Not Found`

#### Update Jackett Instance

```
PUT /api/v1/instances/jackett/{id}
Content-Type: application/json

{
  "name": "Updated Name",
  "url": "http://new-url:9117",
  "api_key": "new-api-key"
}
```

All fields are optional. Only provided fields will be updated.

**Response:** `200 OK` or `404 Not Found`

#### Delete Jackett Instance

```
DELETE /api/v1/instances/jackett/{id}
```

**Response:** `204 No Content` or `404 Not Found`

#### Test Jackett Connection

```
POST /api/v1/instances/jackett/{id}/test
```

**Response:**
```json
{
  "success": true,
  "message": "Connection successful",
  "indexer_count": 45
}
```

### Prowlarr Instances

The Prowlarr endpoints follow the same pattern as Jackett:

- `GET /api/v1/instances/prowlarr` - List all
- `POST /api/v1/instances/prowlarr` - Create
- `GET /api/v1/instances/prowlarr/{id}` - Get one
- `PUT /api/v1/instances/prowlarr/{id}` - Update
- `DELETE /api/v1/instances/prowlarr/{id}` - Delete
- `POST /api/v1/instances/prowlarr/{id}/test` - Test connection

### Get All Instances Status

```
GET /api/v1/instances/status
```

Returns all instances with their current online/offline status and indexer counts.

**Response:**
```json
{
  "jackett": [
    {
      "id": 1,
      "name": "Jackett Primary",
      "url": "http://192.168.1.100:9117",
      "api_key": "abc1...def4",
      "created_at": "2025-01-31T10:00:00Z",
      "updated_at": "2025-01-31T10:00:00Z",
      "status": "online",
      "indexer_count": 45
    }
  ],
  "prowlarr": [
    {
      "id": 1,
      "name": "Prowlarr Main",
      "url": "http://192.168.1.100:9696",
      "api_key": "ghi7...jkl0",
      "created_at": "2025-01-31T10:00:00Z",
      "updated_at": "2025-01-31T10:00:00Z",
      "status": "online",
      "indexer_count": 67
    }
  ],
  "total_online": 2
}
```

---

## Download Clients API

### List Clients

```
GET /api/v1/clients
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "qBittorrent",
    "client_type": "qbittorrent",
    "url": "http://192.168.1.100:8080",
    "created_at": "2025-01-31T10:00:00Z",
    "updated_at": "2025-01-31T10:00:00Z"
  }
]
```

Note: Username and password are never returned in responses for security.

### Create Client

```
POST /api/v1/clients
Content-Type: application/json

{
  "name": "My qBittorrent",
  "client_type": "qbittorrent",
  "url": "http://192.168.1.100:8080",
  "username": "admin",
  "password": "your-password"
}
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Display name (1-255 chars) |
| client_type | string | Yes | Client type (currently only "qbittorrent") |
| url | string | Yes | Client web interface URL |
| username | string | Yes | Authentication username |
| password | string | Yes | Authentication password |

**Response:** `201 Created`

### Get Client

```
GET /api/v1/clients/{id}
```

### Update Client

```
PUT /api/v1/clients/{id}
Content-Type: application/json

{
  "name": "Updated Name",
  "password": "new-password"
}
```

All fields are optional.

### Delete Client

```
DELETE /api/v1/clients/{id}
```

**Response:** `204 No Content`

### Test Client Connection

```
POST /api/v1/clients/{id}/test
```

**Response:**
```json
{
  "success": true,
  "message": "Connected to qBittorrent v4.6.0",
  "indexer_count": null
}
```

### Get All Clients Status

```
GET /api/v1/clients/status/all
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "qBittorrent",
    "client_type": "qbittorrent",
    "url": "http://192.168.1.100:8080",
    "created_at": "2025-01-31T10:00:00Z",
    "updated_at": "2025-01-31T10:00:00Z",
    "status": "online"
  }
]
```

---

## Search API

### Execute Search

```
GET /api/v1/search?q={query}
```

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| q | string | Yes | - | Search query (1-500 chars) |
| category | string | No | All | Category filter |
| jackett_ids | int[] | No | all | Jackett instance IDs to search |
| prowlarr_ids | int[] | No | all | Prowlarr instance IDs to search |
| min_seeders | int | No | 0 | Minimum seeders filter |
| max_size | string | No | - | Max file size (e.g., "10GB") |
| sort_by | string | No | seeders | Sort field |
| sort_order | string | No | desc | Sort order |

**Valid Categories:**
- All, Movies, TV, Music, Software, Games, Books, Anime, Other

**Valid Sort Fields:**
- seeders, size, date, name

**Example Request:**
```
GET /api/v1/search?q=ubuntu&category=Software&min_seeders=10&sort_by=seeders&sort_order=desc
```

**Response:**
```json
{
  "query": "ubuntu",
  "category": "Software",
  "total_results": 25,
  "results": [
    {
      "id": "abc123def456",
      "title": "Ubuntu 24.04 LTS Desktop (64-bit)",
      "source": "Jackett Primary",
      "source_type": "jackett",
      "indexer": "1337x",
      "size": 5033164800,
      "size_formatted": "4.7 GB",
      "seeders": 2847,
      "leechers": 156,
      "date": "2024-04-25T12:00:00Z",
      "category": "Software",
      "magnet_link": "magnet:?xt=urn:btih:...",
      "torrent_url": "http://jackett/dl/...",
      "info_url": "https://1337x.to/torrent/..."
    }
  ],
  "sources_queried": 2,
  "errors": []
}
```

### Get Categories

```
GET /api/v1/search/categories
```

**Response:**
```json
{
  "categories": [
    "All",
    "Movies",
    "TV",
    "Music",
    "Software",
    "Games",
    "Books",
    "Anime",
    "Other"
  ]
}
```

---

## Download API

### Send Torrent to Client

```
POST /api/v1/download
Content-Type: application/json

{
  "client_id": 1,
  "magnet_link": "magnet:?xt=urn:btih:..."
}
```

OR

```json
{
  "client_id": 1,
  "torrent_url": "http://example.com/file.torrent"
}
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| client_id | int | Yes | Download client ID |
| magnet_link | string | Conditional | Magnet URI (provide this OR torrent_url) |
| torrent_url | string | Conditional | URL to .torrent file |

**Response:**
```json
{
  "success": true,
  "message": "Torrent added successfully",
  "client_name": "qBittorrent"
}
```

**Error Response:**
```json
{
  "detail": "Authentication failed"
}
```

---

## Health Check Endpoints

### Basic Health Check

```
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "environment": "development",
  "version": "0.1.0"
}
```

### Readiness Check

```
GET /health/ready
```

Includes database connectivity verification.

**Response:**
```json
{
  "status": "ready",
  "database": "connected"
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 204 | No Content (successful deletion) |
| 400 | Bad Request (validation error or operation failed) |
| 404 | Not Found |
| 422 | Validation Error |
| 500 | Internal Server Error |

### Validation Error Response

```json
{
  "detail": [
    {
      "type": "string_too_short",
      "loc": ["body", "name"],
      "msg": "String should have at least 1 character",
      "input": "",
      "ctx": {"min_length": 1}
    }
  ]
}
```

---

## TypeScript Types

For frontend TypeScript integration, here are the key types:

```typescript
// Instance Types
interface JackettInstance {
  id: number;
  name: string;
  url: string;
  api_key: string;  // Masked
  created_at: string;
  updated_at: string;
}

interface JackettInstanceWithStatus extends JackettInstance {
  status: 'online' | 'offline';
  indexer_count: number | null;
}

interface ProwlarrInstance {
  id: number;
  name: string;
  url: string;
  api_key: string;  // Masked
  created_at: string;
  updated_at: string;
}

interface ProwlarrInstanceWithStatus extends ProwlarrInstance {
  status: 'online' | 'offline';
  indexer_count: number | null;
}

// Client Types
type ClientType = 'qbittorrent';

interface DownloadClient {
  id: number;
  name: string;
  client_type: ClientType;
  url: string;
  created_at: string;
  updated_at: string;
}

interface DownloadClientWithStatus extends DownloadClient {
  status: 'online' | 'offline';
}

// Search Types
type SearchCategory = 'All' | 'Movies' | 'TV' | 'Music' | 'Software' | 'Games' | 'Books' | 'Anime' | 'Other';
type SortBy = 'seeders' | 'size' | 'date' | 'name';
type SortOrder = 'asc' | 'desc';

interface SearchResult {
  id: string;
  title: string;
  source: string;
  source_type: 'jackett' | 'prowlarr';
  indexer: string;
  size: number;
  size_formatted: string;
  seeders: number;
  leechers: number;
  date: string | null;
  category: string;
  magnet_link: string | null;
  torrent_url: string | null;
  info_url: string | null;
}

interface SearchResponse {
  query: string;
  category: SearchCategory;
  total_results: number;
  results: SearchResult[];
  sources_queried: number;
  errors: string[];
}

// Request Types
interface CreateJackettInstance {
  name: string;
  url: string;
  api_key: string;
}

interface CreateDownloadClient {
  name: string;
  client_type: ClientType;
  url: string;
  username: string;
  password: string;
}

interface DownloadRequest {
  client_id: number;
  magnet_link?: string;
  torrent_url?: string;
}

// Response Types
interface TestConnectionResponse {
  success: boolean;
  message: string;
  indexer_count: number | null;
}

interface DownloadResponse {
  success: boolean;
  message: string;
  client_name: string;
}

interface AllInstancesStatus {
  jackett: JackettInstanceWithStatus[];
  prowlarr: ProwlarrInstanceWithStatus[];
  total_online: number;
}
```

---

## Frontend Integration Notes

### Recommended API Call Patterns

1. **Initial Load**: Call `/api/v1/instances/status` and `/api/v1/clients/status/all` to get all configured instances and clients with their current status.

2. **Search Flow**:
   - User enters query and selects filters
   - Call `GET /api/v1/search` with query parameters
   - Display results in table

3. **Send to Client**:
   - User clicks "Send" on a search result
   - Show modal with available online clients (from `/api/v1/clients/status/all`)
   - User selects client
   - Call `POST /api/v1/download` with `client_id` and either `magnet_link` or `torrent_url`

4. **Instance Management**:
   - Use CRUD endpoints for Jackett/Prowlarr instances
   - After adding/updating, call test endpoint to verify connection
   - Refresh status to update indexer counts

### Polling Recommendations

- Poll `/api/v1/instances/status` every 60 seconds to update online/offline status
- Poll `/api/v1/clients/status/all` every 60 seconds for client status
- Consider using WebSockets in future versions for real-time updates

---

## OpenAPI/Swagger

When running in development mode, interactive API documentation is available at:

- Swagger UI: `http://localhost:8000/api/docs`
- ReDoc: `http://localhost:8000/api/redoc`
- OpenAPI JSON: `http://localhost:8000/api/openapi.json`

These are disabled in production for security.
