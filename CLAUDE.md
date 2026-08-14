# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Project Hollow is a locally-hosted, browser-based 3D DICOM viewer built for radiotherapy research — specifically comparing anatomical differences between **upright** and **supine** scans of the same patient. It integrates with **GUAVA-RT** (`guava_rt`, a public PyPI package: https://pypi.org/project/guava-rt/), which performs the geometric analysis (surface distances, displacement, separation distance, DiVH). The app has no cloud dependency; everything runs on localhost.

Two independent datasets can be loaded at once into fixed "slots" — `A` and `B` — corresponding to the two scans being compared (e.g. upright vs. supine). Most backend and frontend state is keyed by slot.

## Architecture

**FastAPI backend (`backend/`) + React/TypeScript/Three.js frontend (`frontend/`).** In production, `run.py` serves the built frontend (`frontend/dist`) as static files from the same FastAPI app (see `backend/app/main.py`); in development the two run as separate servers with Vite proxying `/api` and `/ws` to the backend.

### Backend (`backend/app/`)

- `main.py` — FastAPI app setup, CORS, router registration, and static frontend mounting.
- `storage.py` — All server-side state lives here as module-level in-memory dicts (no DB): `_DATASET_STORAGE` (slot → `Dataset`), `_GUAVA_STORAGE` (masks/regions per slot for GUAVA), `_RESULT_STORAGE` (cached results per analysis op, cleared via `clearResults(*ops)`), plus the global `QUEUE` (job queue) and CUDA/CPU device selection (`getDevice`). Everything resets on server restart — there is no persistence layer.
- `parser.py` — Converts uploaded DICOM bytes into domain objects: `toScanObj` (DICOM series → `Scan`, including slice sorting by orientation normal, HU rescaling, and isometric resampling — all further slicing math assumes isotropic spacing post-resample) and `toContourObjs` (RTStruct → `Contour` dict, rasterizing contour polygons into voxel masks, building meshes, and converting each mask's voxel-index center of mass into absolute patient-space mm — `gv.Mask.center_of_mass` itself is raw `(z, y, x)` voxel indices, not usable as a coordinate without this conversion).
- `guava.py` — Wraps `guava_rt` to build `gv.Region`/`gv.Metrics` objects from the two slots' masks and computes each analysis type (BSD, displacement, separation distance, DiVH, sepdn). Each function caches its result via `storage.setResult`.
- `queue.py` — Minimal async job runner (`Queue.launch`/`run`) used to run GUAVA operations off the request thread and broadcast status updates (`pending → running → complete/error`) to WebSocket subscribers.
- `app/api/` — FastAPI routers:
  - `dataset.py` — dataset CRUD (`/api/dataset/...`): DICOM/RTStruct upload, cardinal + arbitrary-axis slice extraction, contour mesh fetch, visibility, target ROI, and anchor/alignment updates. Each mutating endpoint returns the full `Dataset.summary()` so the frontend can just replace its local copy. Result-invalidation is wired in here (not in `guava.py`): dataset upload/delete clears all 5 cached results, target change clears `divh`/`sepd`/`sepdn`, anchor change clears `disp`. The arbitrary-slice route is registered *before* the generic `/slice/{ax}/{idx}` route since `{ax}` would otherwise also match the literal `"arbitrary"` segment.
  - `guava.py` — `/api/guava/...`: device info, cached results rehydration, and `queue/{job}` to launch a named GUAVA operation (`bsd`, `disp`, `sepd`, `divh`, `sepdn` — see `JOB_LIST`).
  - `websocket.py` — `/ws` endpoint; pushes job queue updates to all connected clients. Also implements an idle-shutdown timer (currently commented out) that would exit the process after all clients disconnect — this is a local single-user app, not a multi-tenant server.
  - `payload.py` — Pydantic request bodies.
- `app/models/` — Dataclasses, not ORM models: `Scan` (voxel array + spacing/origin/modality), `Dataset` (per-slot scan + contours + anchor/alignment/target state — see the anchor/alignment model below), `Contour` (name/color/mask/mesh/center_of_mass), `Mesh` (marching-cubes vertices/faces, in absolute patient-space mm), `Job` (queue job state), and `image.py` (`orthogonal()` for axial/coronal/sagittal slices, `arbitrary()` for freeform-plane slices via `scipy.ndimage.map_coordinates` trilinear interpolation — both return a `Slice`, a base64 PNG data URL plus the plane's `center`/`dU`/`dV`/`width`/`height` for the frontend to texture-map onto a plane).

**Coordinate conventions:** DICOM patient space is `(z, y, x)` for array indexing with `spacing`/`origin` as `(sZ, sY, sX)` / `(oX, oY, oZ)` tuples (note the axis order mismatch between `spacing` and `origin`). `Dataset.__post_init__` defaults `anchor` to the volume's true geometric center (`origin + (shape-1)*spacing/2` — don't reintroduce the `shape` vs `shape-1` off-by-one, it previously caused a visible mis-centering).

**`dV` sign convention (both `orthogonal()` and `arbitrary()`):** `dV` is always the *negation* of the direction the source array's row axis increases along, not the same direction — this falls out of the PIL-save → texture-flipY → PlaneGeometry-UV chain on the frontend. `arbitrary()`'s in-plane "up" vector `v` is derived by projecting a fixed reference (`(0,0,-1)`, falling back to `(0,-1,0)` when the plane is itself axial-like) onto the slicing plane; this exactly reproduces the established cardinal `dV` values at all three cardinal normals and its sampling grid deliberately samples rows along `-v` to match. Don't "fix" an apparent sign flip here without re-deriving this chain — it's already been gotten wrong twice.

**Anchor vs. alignment:** `anchor` picks *which point* (absolute patient-space mm) is pinned to the dataset's local origin; `alignment` is *where* that pinned point then sits in world space, relative to the fixed world-origin axes. Setting a new anchor (`PUT /{slot}/anchor`, e.g. via a contour's center of mass) resets `alignment` to zero so the newly-pinned point lands exactly on world origin. `PUT /{slot}/alignment` is the manual "nudge the dataset relative to world origin" control. The frontend's anchor MM/PX fields in `info.tsx` edit `alignment`, not `anchor`.

### Frontend (`frontend/src/`)

- `state.tsx` — Single global app state via React Context (`AppStateProvider`/`useAppState`), no external state library. Owns dataset state per slot, upload/job/results state, up to two `selected` contours (for arbitrary-axis slicing), and the WebSocket subscription that updates job status and triggers result rehydration. Every mutating action calls the backend then replaces local state with the server's returned summary (server is the source of truth, not optimistic local updates) — except the 5 cached GUAVA results, which the backend invalidates as a side effect of other endpoints (see above) with no corresponding push, so `state.tsx` mirrors those same invalidations locally (`emptyResults()`) for instant UI feedback instead of waiting for a reload.
- `api/client.ts` — Thin fetch wrapper (`_get`/`_post`/`_put`/`_del`) plus one function per backend endpoint.
- `api/websocket.ts` — `Socket` class wrapping the `/ws` connection with auto-reconnect.
- `scene/` — Three.js rendering, decoupled from React (not React components; instantiated/driven imperatively from `view.tsx`'s `useEffect`s):
  - `manager.ts` (`SceneManager`) — owns the THREE scene/camera/renderer. Per-slot content lives in an `inner`/`outer` group pair (`inner` is shifted by `-anchor` so the anchor point sits at `outer`'s local origin; `outer` is then placed at the `alignment` offset — anchor's own world position is deliberately *not* re-added, so the scan translates as its anchor changes). Cardinal axes are a separate object added directly to the scene (not into `inner`/`outer`), fixed at world origin, so they never move with anchor/alignment edits — only the scan content does; only the active slot's own axes are visible. Contour meshes (`renderContour`/`removeContour`/`rendered`/`setContourVisibility`) live inside `inner` alongside the slice plane, keyed by contour id in `d.outs`. `setDualMode(true)` (the `D` key) shows both slots' `outer` groups at once (for side-by-side contour comparison) while force-hiding both scans; `setDualMode(false)` just calls `setActiveSlot('A')`. `setArbitraryAxis`/`clearArbitraryAxis` (the `4` key) draw a single global white line through world origin along a given normal — not per-slot. The camera is a single shared `PerspectiveCamera` driven by a target + distance + orbit `cameraOffset`/`cameraUp` pair (not naive yaw/pitch) so it can orbit around an arbitrary axis (`rotateCamera`, used for space+scroll and the `Enter` flat-view snap) without rolling/flipping — `cameraUp` is always rotated in lockstep with `cameraOffset`. `zoomCamera`/`resetCamera`/`setOrthogonalView` round out the camera API; `resetCamera` restores the state captured by the most recent `setCamera` (i.e. how the active dataset was auto-framed on load), not a hardcoded default.
  - `scan.ts` — builds/disposes a textured `THREE.Mesh` plane for a single orthogonal slice (`render`), a black placeholder plane for out-of-range indices (`renderBlack`, paired with `sliceGeometry`/`arbitrarySliceGeometry`, which mirror the backend's slice-position math client-side so no round-trip is needed to know where an invalid slice *would* sit), and `axisFrame` (world-space normal+up for a cardinal mode, used by the `Enter` flat-view camera snap — arbitrary mode doesn't support `Enter`). `AXIS_DU`/`AXIS_DV` and `arbitrarySliceGeometry`'s basis derivation must stay in sync with the backend's `image.py` (see the `dV` sign convention above — the same reference-projection formula is duplicated here). `axisFrame` additionally negates both normal and up for coronal/sagittal to correct the camera's viewing angle specifically (a separate, camera-only fix layered on top of the already-correct mesh mounting).
  - `mesh.ts` — builds contour `THREE.Mesh` geometry from a `ResponseMesh` (`renderFull`/`renderPartial`); vertices arrive from the backend in raw patient-space mm and must be routed through `toWorld()` per-vertex here, same as everything else — this was missed once and the whole contour rendered in a sheared, wrong location.
  - `coords.ts` (`toWorld`) — the DICOM→Three.js axis remap (`[x, z, -y]`); always route patient-space coordinates through this before handing them to Three.js. It's a proper rotation (det +1), so cross products of `toWorld`-mapped vectors equal the `toWorld` of the patient-space cross product.
- `components/panels/` — `toolbar` (also lists active keybindings — keep in sync when adding view controls), `data` (GUAVA result cards: BSD/DiVH/SepD/SepDN, each gated on `state.results[...]` being non-empty), `info` (contour list + anchor/alignment/target/select controls — the anchor/target/select buttons all share the same two-tier `info-contour-action-img-selected`/`-unselected` decorator pattern), `view` (hosts the `SceneManager`; owns all wheel/keyboard viewport controls).
- `types.ts` — Central type definitions mirroring the backend's `summary()` dict shapes; keep in sync when changing a model's `summary()`. `SliceMode = Axis | 'arbitrary'` is kept separate from `Axis` so the cardinal `AXIS_DU`/`AXIS_DV` lookup tables in `scan.ts` don't need a meaningless static entry for the freeform mode.

Refs (not state) are used heavily in `view.tsx` (`refState`, `refSlice`, `refOpToken`, etc.) to avoid stale closures inside imperative event listeners and to give in-flight slice requests a monotonically increasing token so late responses from superseded requests are dropped. The scene-lifecycle `useEffect` in `view.tsx` must keep an empty `[]` dependency array — it previously had none, which tore down and rebuilt the entire Three.js scene (wiping all rendered content) on every unrelated re-render.

**Arbitrary-axis slicing:** selecting exactly two contours (`info.tsx`'s select button, capped at two, tracked in `state.selected` — can span both slots) and pressing `4` computes a normal from the direction between their centers of mass, draws the white marker line, and switches both loaded slots into `'arbitrary'` mode at `idx=0`. From there it behaves identically to the cardinal axes (same wheel-scroll/black-frame/index-sync machinery in `view.tsx`'s `refreshSlice`), since arbitrary mode is a value of the same `slice.mode`/`slice.idx` state, not a separate code path — `arbitraryMaxIdx`/`arbitrarySliceGeometry` in `scan.ts` just branch on `mode === 'arbitrary'` where the cardinal per-axis lookup tables don't apply. The slicing plane always passes through the dataset's own `anchor` (so it starts centered on world origin, matching how the cardinal axes work).

**View keybindings** (`view.tsx`): `1`/`2`/`3` axial/coronal/sagittal, `4` arbitrary axis (only activates with exactly two contours selected) — all applied to *both* loaded slots so their slice indices/modes stay comparable; scroll to page through slices (also both loaded slots — indices are allowed to go out of each dataset's own valid range, rendered as a black placeholder, rather than being clamped per-dataset and desyncing the two); `Ctrl/Cmd`+scroll to zoom; `Space`+scroll to orbit the camera about the axis normal to the current view; `Tab` to switch the active slot (or exit dual mode back to slot A, if active); `D` to enter dual mode (both slots' contours visible at once, scans force-hidden via the same `updateVisibility` path the info-panel toggle uses — not a scene-only override, since a stale scene override gets clobbered by the next slice fetch); `Enter` for a flat face-on view of the current cardinal slice plane (guarded against firing while a text input is focused); `O` to reset the camera to how it was framed on load.

## Commands

### Backend
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 5000    # dev server (also: ./dev.sh)
python run.py --port 7000                    # prod-style: serves built frontend/dist, opens browser
```
Dependencies are in `backend/requirements.txt` (includes `guava_rt`, a public PyPI package: https://pypi.org/project/guava-rt/). No test suite or lint config currently exists for the backend.

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

- `guava_rt` (https://pypi.org/project/guava-rt/) is an external dependency (device-aware: CUDA if available, else CPU — see `storage.getDevice`). Its API surface (`gv.Mask`, `gv.Region`, `gv.Metrics`) is used but not defined in this repo — `gv.Mask.center_of_mass` in particular returns raw voxel indices, not a usable coordinate (see `parser.toContourObjs`).
- `plans/` contains design docs (`specification.md` is the SRS, `roadmap.md` the phase plan) — check these for intended behavior when a feature seems underspecified in code, but treat them as historical/aspirational rather than a guarantee of current implementation state.
