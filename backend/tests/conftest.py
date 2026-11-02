import os
import sys
import tempfile
from pathlib import Path

import pytest

# Isolate test data from the real data directory before the app is imported.
_TMP = tempfile.mkdtemp(prefix="threatgraph_test_")
os.environ["THREATGRAPH_DATA_DIR"] = _TMP
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture(scope="session")
def sample_csv() -> Path:
    from app.sample_data import generate_sample
    return generate_sample(Path(_TMP) / "sample.csv", n_benign=4000, seed=3)
