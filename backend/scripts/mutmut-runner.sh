#!/bin/bash
exec python -m pytest tests/ -x --tb=short -p no:cacheprovider --no-header -q --override-ini=addopts= --cov-fail-under=0
