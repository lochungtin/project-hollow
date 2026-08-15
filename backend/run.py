import sys
import threading
import time
import webbrowser
from argparse import ArgumentParser, RawDescriptionHelpFormatter
from pathlib import Path

import uvicorn


def main(port):
    dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
    if not dist.exists():
        print(
            "No built frontend found at frontend/dist.\n"
            "Build it once with:\n"
            "    cd frontend && npm install && npm run build\n"
            "then run `python run.py` again.",
            file=sys.stderr,
        )
        sys.exit(1)

    def run_browser():
        time.sleep(5)
        webbrowser.open(f"http://localhost:{port}")

    threading.Thread(target=run_browser, daemon=True).start()
    print(f"Project Hollow - Web App starting at http://localhost:{port}")

    uvicorn.run("app.main:app", host="localhost", port=port, reload=False)


if __name__ == "__main__":
    p = ArgumentParser(formatter_class=RawDescriptionHelpFormatter)
    p.add_argument("--port", "-p", type=int, default=7000)
    args = p.parse_args()
    main(args.port)
