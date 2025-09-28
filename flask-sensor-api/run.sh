#!/bin/bash
set -euo pipefail

# Use the system python3 to avoid PATH issues
PY=python3

$PY -m pip install -r requirements.txt

# Run the app directly so we don't depend on flask CLI being on PATH
exec $PY app.py
