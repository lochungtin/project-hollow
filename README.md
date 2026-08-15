# Project Hollow

Custom fully local 3D DICOM viewer for upright RT research.

Hollow is a browser-based viewer for comparing two DICOM scans of the same patient — typically an **upright** and a **supine** acquisition — side by side in 3D. It's built specifically for radiotherapy research workflows: loading a scan and its RT Structure Set, aligning two datasets against each other, and running quantitative anatomical comparisons via [GUAVA-RT](https://pypi.org/project/guava-rt/) without leaving the app.

Everything runs locally — there is no cloud dependency and no data ever leaves your machine.

## Features

- **DICOM series + RT Structure Set loading**, into two independent slots (`A` and `B`) so you can load, say, an upright and a supine scan of the same patient at once.
- **Interactive 3D viewing** — orbit, zoom, and page through axial/coronal/sagittal slices rendered as textured planes in a real 3D scene, alongside any loaded contour surfaces.
- **Contour slice-overlay mode** — instead of full 3D surfaces, draw each contour's 2D cross-section directly onto the current slice, for a classic axial/coronal/sagittal-with-outlines view.
- **Arbitrary-axis slicing** — pick any two contours and slice the volume along the axis between their centers of mass, interpolated on the fly (not restricted to the voxel grid).
- **Dataset registration** — anchor a dataset to a specific point (e.g. a contour's center of mass) and manually nudge its position, so two differently-positioned scans can be visually aligned at a shared reference point.
- **Dual mode** — view both datasets' contours overlaid at once (3D surfaces or 2D slice-overlays) for a direct visual comparison.
- **Distance-map visualization** — color a contour's surface (or slice cross-section) by its distance from the current target ROI, red (near) to blue (far), on a scale shared across every contour so you can compare at a glance.
- **Quantitative GUAVA-RT analysis**, computed between whatever's loaded in slots A and B:
  - Volume & surface area per structure
  - Bidirectional Surface Discrepancy (BSD)
  - ROI relative displacement
  - Separation distance (and nearside-surface variant)
  - Distance Volume Histogram (DiVH)
- Runs entirely offline against your local machine's CPU or GPU (CUDA, if available).

## Requirements

- Python 3.12 (backend), with a GPU + CUDA optional but recommended for the GUAVA-RT computations
- Node.js + npm (frontend build only — not needed at runtime once built)
- [`guava_rt`](https://pypi.org/project/guava-rt/) — installed automatically from `backend/requirements.txt`

## Getting Started

Build the frontend once, then run the backend, which serves the built app itself — no separate frontend server needed for normal use.

```bash
# 1. build the frontend
cd frontend
npm install
npm run build

# 2. set up and run the backend
cd ../backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py --port 7000
```

`run.py` starts the server and opens your browser to it automatically. Use `--port` to change the port (default `7000`).

If you're actively developing the frontend, run it separately instead with hot-reload:

```bash
# backend, in one terminal
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 5000

# frontend, in another terminal
cd frontend && npm run dev
```

### Running with Docker

The included `Dockerfile`/`docker-compose.yml` build the frontend and run the backend in a single container — no local Python or Node setup needed.

```bash
docker compose up --build
```

Then open http://localhost:7000. Stop it with `Ctrl+C` or `docker compose down`.

Without Compose:

```bash
docker build -t hollow .
docker run -p 7000:7000 hollow          # CPU
docker run -p 7000:7000 --gpus all hollow   # with GPU passthrough
```

Notes:
- This needs a running Docker daemon. If `docker compose up`/`docker build` fails with `failed to connect to the docker API at unix:///var/run/docker.sock`, Docker (Docker Desktop, or `dockerd` on native Linux) isn't running — start it first.
- `docker-compose.yml` requests an NVIDIA GPU by default (`deploy.resources.reservations.devices`), which requires the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) on the host. If you don't have a GPU or the toolkit installed, remove that block — GUAVA-RT automatically falls back to CPU.
- The container restarts automatically (`restart: unless-stopped`): the backend exits a few seconds after the last browser tab disconnects to free GPU/CPU between sessions (this is a local, single-user app), and the restart policy brings it right back for your next visit.

## Usage

### Loading a dataset

Each of the two panels on the right (`A` and `B`) starts empty. Click **Load DICOM Series** and select every file belonging to one series — once it's loaded, the panel shows the scan's modality, shape, and voxel spacing, and **Load RTSTRUCT** appears so you can attach the matching RT Structure Set to that same slot.

You can load a dataset into slot `A`, slot `B`, or both — most of the app works with only one loaded, but the comparison analyses and dual mode need both.

### Navigating the 3D view

| Input | Action |
|---|---|
| `Tab` | Switch the active slot (`A` ↔ `B`) — or, if dual mode is active, exit it back to slot `A` |
| `D` | Toggle dual mode: show both slots' contours together, with both scans hidden |
| `M` | Toggle contour slice-overlay mode: draw each visible contour's 2D cross-section on the current slice instead of its full 3D surface |
| `1` / `2` / `3` | Switch to axial / coronal / sagittal slicing |
| `4` | Switch to arbitrary-axis slicing (requires exactly two contours selected — see below) |
| Wheel | Page through slices along the current axis |
| `Ctrl`/`Cmd` + Wheel | Zoom the camera |
| `Space` + Wheel | Orbit the camera around the axis normal to the current slice view |
| `Enter` | Snap to a flat, face-on view of the current slice (axial/coronal/sagittal only) |
| `O` | Reset the camera to how it was framed when the dataset loaded |

Only one slot's scan and contours are rendered at a time (whichever is active) — use `Tab` to flip between them, or `D` for a side-by-side contour comparison in dual mode. `M` works the same way in either single-slot or dual mode.

### Aligning two datasets

Each dataset has an **anchor** — the point that's pinned to the shared world origin — and an **alignment**, a manual offset from that origin. By default the anchor is the volume's own geometric center.

In the info panel:
- The **Anchor (mm)** / **Anchor (px)** fields and **Set Anchor** button edit the alignment offset directly — type new values and click **Set Anchor** to nudge the dataset relative to world origin.
- Clicking the **anchor icon** next to a contour instead re-pins the dataset to *that contour's* center of mass, resetting the alignment offset to zero so it lands exactly on world origin. This is the main way to line up two scans on the same anatomical landmark.

### Working with contours

Once an RT Structure Set is loaded, each structure appears in the contour list with five actions:

- **Name / color swatch** — click to toggle that contour's visibility in the 3D view. Colors are assigned automatically and consistently by dataset: slot `A`'s contours are red/purple/blue tones, slot `B`'s are yellow/green tones, spread out so contours within the same dataset stay visually distinct from each other.
- **Anchor icon** — pin this contour's center of mass as the dataset's anchor point (see above).
- **Target icon** — mark this contour as the target ROI, used by the GUAVA-RT analyses and by distance-map visualization (see below).
- **Select icon** — mark this contour as one of up to two selected contours, used to define the normal for arbitrary-axis slicing (press `4` once two are selected, across either or both slots).
- **DMap icon** — toggle distance-map visualization for this contour: instead of its flat color, it renders (as a 3D surface, or a 2D cross-section in slice-overlay mode) colored by its distance from the current target ROI, red for near and blue for far, on a scale shared across every contour in the dataset. Disabled until a target is set, and for the target contour itself.

### Running analyses

The data panel (bottom) shows one card per analysis type — Volume, Surface Area, BSD, ROI Displacement, Separation Distance, DiVH, and the nearside-surface variant of Separation Distance. Volume and Surface Area update live as contours load; the rest are computed on demand — click **Queue Job to Local Server** on a card to run it, and its status/progress appears in the toolbar until it completes.

Loading or removing a dataset invalidates every cached result; changing the target ROI invalidates DiVH/Separation Distance; changing a dataset's anchor invalidates ROI displacement — re-run the relevant analysis after making those kinds of changes.

## License

MIT — see [LICENSE](LICENSE).
