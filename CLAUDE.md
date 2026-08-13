# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Project Hollow is a locally-hosted, browser-based 3D DICOM viewer built for radiotherapy research — specifically comparing anatomical differences between **upright** and **supine** scans of the same patient. It integrates with **GUAVA-RT** (`guava_rt`, a proprietary/private package not on PyPI — installed in the backend venv), which performs the geometric analysis (surface distances, displacement, separation distance, DiVH). The app has no cloud dependency; everything runs on localhost.

Two independent datasets can be loaded at once into fixed "slots" — `A` and `B` — corresponding to the two scans being compared (e.g. upright vs. supine). Most backend and frontend state is keyed by slot.

## Architecture

**FastAPI backend (`backend/`) + React/TypeScript/Three.js frontend (`frontend/`).** In production, `run.py` serves the built frontend (`frontend/dist`) as static files from the same FastAPI app (see `backend/app/main.py`); in development the two run as separate servers with Vite proxying `/api` and `/ws` to the backend.

### Backend (`backend/app/`)

- `main.py` — FastAPI app setup, CORS, router registration, and static frontend mounting.
- `storage.py` — All server-side state lives here as module-level in-memory dicts (no DB): `_DATASET_STORAGE` (slot → `Dataset`), `_GUAVA_STORAGE` (masks/regions per slot for GUAVA), `_RESULT_STORAGE` (cached results per analysis op), plus the global `QUEUE` (job queue) and CUDA/CPU device selection (`getDevice`). Everything resets on server restart — there is no persistence layer.
- `parser.py` — Converts uploaded DICOM bytes into domain objects: `toScanObj` (DICOM series → `Scan`, including slice sorting by orientation normal, HU rescaling, and isometric resampling) and `toContourObjs` (RTStruct → `Contour` dict, rasterizing contour polygons into voxel masks and building meshes).
- `guava.py` — Wraps `guava_rt` to build `gv.Region`/`gv.Metrics` objects from the two slots' masks and computes each analysis type (BSD, displacement, separation distance, DiVH). Each function caches its result via `storage.setResult`.
- `queue.py` — Minimal async job runner (`Queue.launch`/`run`) used to run GUAVA operations off the request thread and broadcast status updates (`pending → running → complete/error`) to WebSocket subscribers.
- `app/api/` — FastAPI routers:
  - `dataset.py` — dataset CRUD (`/api/dataset/...`): DICOM/RTStruct upload, slice extraction (`/slice/{ax}/{idx}`), visibility, target ROI, and anchor point updates. Each mutating endpoint returns the full `Dataset.summary()` so the frontend can just replace its local copy.
  - `guava.py` — `/api/guava/...`: device info, cached results rehydration, and `queue/{job}` to launch a named GUAVA operation (`bsd`, `disp`, `sepd`, `divh`, `sepdn` — see `JOB_LIST`).
  - `websocket.py` — `/ws` endpoint; pushes job queue updates to all connected clients. Also implements an idle-shutdown timer (currently commented out) that would exit the process after all clients disconnect — this is a local single-user app, not a multi-tenant server.
  - `payload.py` — Pydantic request bodies.
- `app/models/` — Dataclasses, not ORM models: `Scan` (voxel array + spacing/origin/modality), `Dataset` (per-slot scan + contours + anchor/target/rotation state), `Contour` (name/color/mask/mesh), `Mesh` (marching-cubes vertices/faces), `Job` (queue job state), and `image.py` (`orthogonal()` — extracts an axial/coronal/sagittal slice from a `Scan` as a base64 PNG data URL for the frontend to texture-map onto a plane).

Coordinate conventions: DICOM patient space is `(z, y, x)` for array indexing with `spacing`/`origin` as `(sZ, sY, sX)` / `(oX, oY, oZ)` tuples (note the axis order mismatch between `spacing` and `origin` — read carefully when touching this code). `parser._resample` normalizes anisotropic voxel spacing to isometric before storage.

### Frontend (`frontend/src/`)

- `state.tsx` — Single global app state via React Context (`AppStateProvider`/`useAppState`), no external state library. Owns dataset state per slot, upload/job/results state, and the WebSocket subscription that updates job status and triggers result rehydration. Every mutating action calls the backend then replaces local state with the server's returned summary (server is the source of truth, not optimistic local updates).
- `api/client.ts` — Thin fetch wrapper (`_get`/`_post`/`_put`/`_del`) plus one function per backend endpoint.
- `api/websocket.ts` — `Socket` class wrapping the `/ws` connection with auto-reconnect.
- `scene/` — Three.js rendering, decoupled from React:
  - `manager.ts` (`SceneManager`) — owns the THREE scene/camera/renderer and per-slot groups (`inner`/`outer` — `inner` holds content positioned relative to the dataset's anchor, `outer` handles the anchor-to-world offset/rotation for aligning the two datasets). Not a React component; instantiated imperatively inside `view.tsx`'s `useEffect`.
  - `scan.ts` — builds/disposes a textured `THREE.Mesh` plane for a single orthogonal slice, returned from the backend as a PNG data URL.
  - `coords.ts` (`toWorld`) — the DICOM→Three.js axis remap (`[x, z, -y]`); always route patient-space coordinates through this before handing them to Three.js.
- `components/panels/` — `toolbar`, `data` (dataset upload/management), `info` (contour/anchor/target controls), `view` (hosts the `SceneManager`, handles wheel/keyboard input for slice scrolling and axis/slot switching — see `AXIS_NUM_MAP`/`AXIS_NUM_MAP` key bindings `1`/`2`/`3` for axial/coronal/sagittal and `Tab` to switch active slot).
- `types.ts` — Central type definitions mirroring the backend's `summary()` dict shapes; keep in sync when changing a model's `summary()`.

Refs (not state) are used heavily in `view.tsx` (`refState`, `refSlice`, `refOpToken`, etc.) to avoid stale closures inside imperative event listeners and to give in-flight slice requests a monotonically increasing token so late responses from superseded requests are dropped.

## Commands

### Backend
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 5000    # dev server (also: ./dev.sh)
python run.py --port 7000                    # prod-style: serves built frontend/dist, opens browser
```
Dependencies are in `backend/requirements.txt` (includes `guava_rt`, which is not a public PyPI package). No test suite or lint config currently exists for the backend.

### Frontend
```bash
cd frontend
npm install
npm run dev        # Vite dev server; proxies /api and /ws to localhost:5000 (see vite.config.ts)
npm run build       # tsc -b && vite build -> frontend/dist
npm run preview
```
No test suite currently exists. `npm run build` runs the TypeScript project build (`tsc -b`) first, so it doubles as a type-check.

## Notes

- `guava_rt` is an external, non-public dependency (device-aware: CUDA if available, else CPU — see `storage.getDevice`). Its API surface (`gv.Mask`, `gv.Region`, `gv.Metrics`) is used but not defined in this repo.
- `plans/` contains design docs (`specification.md` is the SRS, `roadmap.md` the phase plan) — check these for intended behavior when a feature seems underspecified in code, but treat them as historical/aspirational rather than a guarantee of current implementation state.
