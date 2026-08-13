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

Coordinate conventions: DICOM patient space is `(z, y, x)` for array indexing with `spacing`/`origin` as `(sZ, sY, sX)` / `(oX, oY, oZ)` tuples (note the axis order mismatch between `spacing` and `origin` — read carefully when touching this code). `parser._resample` normalizes anisotropic voxel spacing to isometric before storage. `Dataset.__post_init__` defaults `anchor` to the volume's true geometric center (`origin + (shape-1)*spacing/2`, matching the `(shape-1)` convention used everywhere slice/axes geometry is computed — don't reintroduce the `shape` vs `shape-1` off-by-one, it previously caused a visible mis-centering).

### Frontend (`frontend/src/`)

- `state.tsx` — Single global app state via React Context (`AppStateProvider`/`useAppState`), no external state library. Owns dataset state per slot, upload/job/results state, and the WebSocket subscription that updates job status and triggers result rehydration. Every mutating action calls the backend then replaces local state with the server's returned summary (server is the source of truth, not optimistic local updates).
- `api/client.ts` — Thin fetch wrapper (`_get`/`_post`/`_put`/`_del`) plus one function per backend endpoint.
- `api/websocket.ts` — `Socket` class wrapping the `/ws` connection with auto-reconnect.
- `scene/` — Three.js rendering, decoupled from React (not React components; instantiated/driven imperatively from `view.tsx`'s `useEffect`s):
  - `manager.ts` (`SceneManager`) — owns the THREE scene/camera/renderer. Per-slot content lives in an `inner`/`outer` group pair (`inner` is shifted by `-anchor` so the anchor point sits at `outer`'s local origin; `outer` is then placed at the `alignment` offset — anchor's own world position is deliberately *not* re-added, so the scan translates as its anchor changes). Axes are a separate object added directly to the scene (not into `inner`/`outer`), fixed at world origin, so they never move with anchor/alignment edits — only the scan content does. Only the active slot's `outer` group (and its axes) is visible at a time (`setActiveSlot`). The camera is a single shared `PerspectiveCamera` driven by a target + distance + orbit `cameraOffset`/`cameraUp` pair (not naive yaw/pitch) so it can orbit around an arbitrary axis (`rotateCamera`, used for space+scroll and the `Enter` flat-view snap) without rolling/flipping — `cameraUp` is always rotated in lockstep with `cameraOffset`. `zoomCamera`/`resetCamera`/`setOrthogonalView` round out the camera API; `resetCamera` restores the state captured by the most recent `setCamera` (i.e. how the active dataset was auto-framed on load), not a hardcoded default.
  - `scan.ts` — builds/disposes a textured `THREE.Mesh` plane for a single orthogonal slice (`render`), a black placeholder plane for out-of-range indices (`renderBlack`, paired with `sliceGeometry` which mirrors the backend's `orthogonal()` position math client-side so no round-trip is needed to know where an invalid slice *would* sit), and `axisFrame` (world-space normal+up for a given axial/coronal/sagittal mode, used by the `Enter` flat-view camera snap). `AXIS_DU`/`AXIS_DV` here must stay in sync with the backend's `dV`/`dU` mapping in `image.py`. Note `axisFrame` deliberately negates both normal and up for coronal/sagittal (but not axial) to correct a Superior/Inferior flip — the raw plane basis has "up" pointing Inferior for those two views; see the comment there before changing sign conventions.
  - `coords.ts` (`toWorld`) — the DICOM→Three.js axis remap (`[x, z, -y]`); always route patient-space coordinates through this before handing them to Three.js. It's a proper rotation (det +1), so cross products of `toWorld`-mapped vectors equal the `toWorld` of the patient-space cross product — relevant when reasoning about plane-facing/normal directions.
- `components/panels/` — `toolbar` (also lists active keybindings — keep in sync when adding view controls), `data` (dataset upload/management), `info` (contour/anchor/target controls), `view` (hosts the `SceneManager`; owns all wheel/keyboard viewport controls).
- `types.ts` — Central type definitions mirroring the backend's `summary()` dict shapes; keep in sync when changing a model's `summary()`.

Refs (not state) are used heavily in `view.tsx` (`refState`, `refSlice`, `refOpToken`, etc.) to avoid stale closures inside imperative event listeners and to give in-flight slice requests a monotonically increasing token so late responses from superseded requests are dropped. The scene-lifecycle `useEffect` in `view.tsx` must keep an empty `[]` dependency array — it previously had none, which tore down and rebuilt the entire Three.js scene (wiping all rendered content) on every unrelated re-render.

**View keybindings** (`view.tsx`, all on the active slot unless noted): `1`/`2`/`3` axial/coronal/sagittal (applied to *both* loaded slots so their slice indices stay comparable), scroll to page through slices (also applied to both loaded slots — indices are allowed to go out of each dataset's own valid range, rendered as a black placeholder, rather than being clamped per-dataset and desyncing the two), `Ctrl/Cmd`+scroll to zoom, `Space`+scroll to orbit the camera about the axis normal to the current view, `Tab` to switch the active slot, `Enter` for a flat face-on view of the current slice plane (guarded against firing while a text input is focused), `O` to reset the camera to how it was framed on load.

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
