source .venv/bin/activate

uvicorn app.main:app --reload --port 5000
# uvicorn app.main:app --port 5000