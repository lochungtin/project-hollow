# Project Hollow

Custom fully local 3D DICOM viewer for upright RT research.

Hollow is a browser-based viewer for comparing two DICOM scans of the same patient — typically an **upright** and a **supine** acquisition — side by side in 3D. It's built specifically for radiotherapy research workflows: loading a scan and its RT Structure Set, aligning two datasets against each other, and running quantitative anatomical comparisons via [GUAVA-RT](https://pypi.org/project/guava-rt/) without leaving the app.

Everything runs locally — there is no cloud dependency and no data ever leaves your machine.

## Features

- **DICOM series + RT Structure Set loading**, into two independent slots (`A` and `B`) so you can load, say, an upright and a supine scan of the same patient at once.
- **Interactive 3D viewing** — orbit, zoom, and page through axial/coronal/sagittal slices rendered as textured planes in a real 3D scene, alongside any loaded contour surfaces.
- **Arbitrary-axis slicing** — pick any two contours and slice the volume along the axis between their centers of mass, interpolated on the fly (not restricted to the voxel grid).
- **Dataset registration** — anchor a dataset to a specific point (e.g. a contour's center of mass) and manually nudge its position, so two differently-positioned scans can be visually aligned at a shared reference point.
- **Dual mode** — view both datasets' contour surfaces overlaid at once for a direct visual comparison.
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

## Usage

### Loading a dataset

Each of the two panels on the right (`A` and `B`) starts empty. Click **Load DICOM Series** and select every file belonging to one series — once it's loaded, the panel shows the scan's modality, shape, and voxel spacing, and **Load RTSTRUCT** appears so you can attach the matching RT Structure Set to that same slot.

You can load a dataset into slot `A`, slot `B`, or both — most of the app works with only one loaded, but the comparison analyses and dual mode need both.

### Navigating the 3D view

| Input | Action |
|---|---|
| `Tab` | Switch the active slot (`A` ↔ `B`) — or, if dual mode is active, exit it back to slot `A` |
| `D` | Toggle dual mode: show both slots' contours together, with both scans hidden |
| `1` / `2` / `3` | Switch to axial / coronal / sagittal slicing |
| `4` | Switch to arbitrary-axis slicing (requires exactly two contours selected — see below) |
| Scroll | Page through slices along the current axis |
| `Ctrl`/`Cmd` + Scroll | Zoom the camera |
| `Space` + Scroll | Orbit the camera around the axis normal to the current slice view |
| `Enter` | Snap to a flat, face-on view of the current slice (axial/coronal/sagittal only) |
| `O` | Reset the camera to how it was framed when the dataset loaded |

Only one slot's scan and contours are rendered at a time (whichever is active) — use `Tab` to flip between them, or `D` for a side-by-side contour comparison in dual mode.

### Aligning two datasets

Each dataset has an **anchor** — the point that's pinned to the shared world origin — and an **alignment**, a manual offset from that origin. By default the anchor is the volume's own geometric center.

In the info panel:
- The **Anchor (mm)** / **Anchor (px)** fields and **Set Anchor** button edit the alignment offset directly — type new values and click **Set Anchor** to nudge the dataset relative to world origin.
- Clicking the **anchor icon** next to a contour instead re-pins the dataset to *that contour's* center of mass, resetting the alignment offset to zero so it lands exactly on world origin. This is the main way to line up two scans on the same anatomical landmark.

### Working with contours

Once an RT Structure Set is loaded, each structure appears in the contour list with four actions:

- **Name / color swatch** — click to toggle that contour's visibility in the 3D view.
- **Anchor icon** — pin this contour's center of mass as the dataset's anchor point (see above).
- **Target icon** — mark this contour as the target ROI, used by the GUAVA-RT analyses.
- **Select icon** — mark this contour as one of up to two selected contours, used to define the normal for arbitrary-axis slicing (press `4` once two are selected, across either or both slots).

### Running analyses

The data panel (bottom) shows one card per analysis type — Volume, Surface Area, BSD, ROI Displacement, Separation Distance, DiVH, and the nearside-surface variant of Separation Distance. Volume and Surface Area update live as contours load; the rest are computed on demand — click **Queue Job to Local Server** on a card to run it, and its status/progress appears in the toolbar until it completes.

Loading or removing a dataset invalidates every cached result; changing the target ROI invalidates DiVH/Separation Distance; changing a dataset's anchor invalidates ROI displacement — re-run the relevant analysis after making those kinds of changes.

## License

MIT — see [LICENSE](LICENSE).
