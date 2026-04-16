"""ASGI entrypoint compatibility shim.

Allows running the backend with either:
- uvicorn main:app
- uvicorn app:app
"""

from main import app
