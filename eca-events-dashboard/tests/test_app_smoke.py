"""
Smoke tests: run app.py and every page via Streamlit's AppTest against the
synthetic dataset and assert no page raises. Catches runtime/plotting/pandas
errors the pure-pipeline tests can't.
"""
import os
import glob

import pytest

os.environ["ECA_DATA_SOURCE"] = "synthetic"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

try:
    from streamlit.testing.v1 import AppTest
    HAVE_ST = True
except Exception:
    HAVE_ST = False

PAGES = [os.path.join(ROOT, "app.py")] + sorted(glob.glob(os.path.join(ROOT, "pages", "*.py")))


@pytest.mark.skipif(not HAVE_ST, reason="streamlit not installed")
@pytest.mark.parametrize("script", PAGES, ids=[os.path.basename(p) for p in PAGES])
def test_page_runs_without_exception(script):
    at = AppTest.from_file(script, default_timeout=60)
    at.run()
    assert not at.exception, f"{os.path.basename(script)} raised: {at.exception}"
