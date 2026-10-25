import os
import tempfile
from pathlib import Path

os.environ["SHCHEBEN_DB"] = str(
    Path(tempfile.mkdtemp(prefix="shcheben_test_")) / "shcheben_test.db"
)

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def clean_db(client):
    client.post("/api/admin/reset-demo")
    yield
