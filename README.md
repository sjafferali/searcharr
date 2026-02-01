# Searcharr

A unified torrent search aggregator that consolidates search results from multiple indexer management tools (Jackett and Prowlarr) into a single interface. Search across all configured indexers simultaneously and send selected torrents directly to your preferred download clients.

## Features

### Unified Search
- Single search bar queries all configured Jackett and Prowlarr instances
- Category filtering (Movies, TV, Music, Software, Games, Books, Anime, Other)
- Real-time search with loading state indicators
- Results aggregated from all sources with source attribution

### Advanced Filtering & Sorting
- Filter by minimum seeders
- Filter by maximum file size
- Sort by Seeders, Size, Date, or Name (ascending/descending)
- Select which instances to include in search

### Search Results
Each result displays:
- Title with category badge and indexer source
- Source instance name
- File size
- Seeders/Leechers count
- Upload date
- Quick actions (Bookmark, Copy Magnet, Download .torrent, Send to Client)

### Instance Management
Configure and manage multiple Jackett and Prowlarr instances:
- Connection status monitoring (online/offline)
- Indexer count display
- Test connection functionality

### Download Client Integration
Send torrents directly to your download clients:
- **Supported**: qBittorrent
- Client status monitoring

## Quick Start with Docker Compose

1. Clone the repository:
```bash
git clone https://github.com/yourusername/searcharr.git
cd searcharr
```

2. Build the Docker image:
```bash
docker build -t searcharr:latest .
```

3. Start the application:
```bash
docker-compose up -d
```

The application will be available at:
- **Web UI**: http://localhost:8080
- **API Documentation**: http://localhost:8080/api/docs
- **Health Check**: http://localhost:8080/api/health

## Docker Compose Example

```yaml
services:
  searcharr:
    image: searcharr:latest
    container_name: searcharr
    ports:
      - "8080:8080"
    environment:
      - DATABASE_TYPE=postgresql
      - POSTGRES_HOST=postgres
      - POSTGRES_PORT=5432
      - POSTGRES_USER=searcharr
      - POSTGRES_PASSWORD=searcharr
      - POSTGRES_DB=searcharr
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    container_name: searcharr_postgres
    environment:
      - POSTGRES_USER=searcharr
      - POSTGRES_PASSWORD=searcharr
      - POSTGRES_DB=searcharr
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U searcharr -d searcharr"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
```

## Environment Variables

All environment variables are optional and have sensible defaults.

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_TYPE` | `postgresql` | Database type (`sqlite` or `postgresql`) |
| `POSTGRES_HOST` | `localhost` | PostgreSQL server host |
| `POSTGRES_PORT` | `5432` | PostgreSQL server port |
| `POSTGRES_USER` | `searcharr` | PostgreSQL username |
| `POSTGRES_PASSWORD` | `searcharr` | PostgreSQL password |
| `POSTGRES_DB` | `searcharr` | PostgreSQL database name |
| `LOG_LEVEL` | `INFO` | Logging level (DEBUG, INFO, WARNING, ERROR) |

For local development with SQLite:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_TYPE` | `sqlite` | Set to `sqlite` for local file-based database |
| `SQLITE_DATABASE_PATH` | `./searcharr.db` | SQLite database file path |

## Local Development

### Prerequisites
- Python 3.11+
- Node.js 20+
- Poetry

### Backend Setup

```bash
# Install dependencies
poetry install

# Start the backend (uses SQLite by default)
DATABASE_TYPE=sqlite poetry run uvicorn backend.app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at http://localhost:5173

## API Endpoints

### Health
- `GET /api/health` - Basic health check
- `GET /api/health/ready` - Readiness check with database connectivity

### Instances (v1)
- `GET /api/v1/instances` - List all instances
- `POST /api/v1/instances/jackett` - Add Jackett instance
- `POST /api/v1/instances/prowlarr` - Add Prowlarr instance
- `PUT /api/v1/instances/{type}/{id}` - Update instance
- `DELETE /api/v1/instances/{type}/{id}` - Delete instance
- `POST /api/v1/instances/{type}/{id}/test` - Test instance connection

### Clients (v1)
- `GET /api/v1/clients` - List all download clients
- `POST /api/v1/clients` - Add download client
- `PUT /api/v1/clients/{id}` - Update client
- `DELETE /api/v1/clients/{id}` - Delete client
- `POST /api/v1/clients/{id}/test` - Test client connection

### Search (v1)
- `POST /api/v1/search` - Search across all configured instances

### Download (v1)
- `POST /api/v1/download` - Send torrent to download client

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── api/           # API endpoints
│   │   ├── core/          # Database configuration
│   │   ├── models/        # SQLAlchemy models
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── services/      # Business logic (Jackett, Prowlarr, qBittorrent)
│   │   ├── config.py      # Configuration
│   │   └── main.py        # FastAPI application
│   └── tests/             # Backend tests
├── frontend/
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   └── services/      # API services
│   └── public/            # Static assets
├── deployment/            # nginx, supervisor configs
├── docker-compose.yml     # Docker Compose configuration
├── Dockerfile             # Multi-stage Dockerfile
└── pyproject.toml         # Python dependencies
```

## License

MIT License - See [LICENSE](LICENSE) for details.
