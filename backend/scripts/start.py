"""
Start the application server.
"""

import uvicorn


def main():
    """Start the FastAPI application."""
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        workers=1,
    )


if __name__ == "__main__":
    main()
