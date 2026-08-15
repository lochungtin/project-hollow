import guava_rt as gv
import numpy as np
from fastapi import APIRouter, HTTPException, UploadFile

from ..models.dataset import Dataset
from ..models.image import (
    arbitrary,
    arbitraryMask,
    arbitraryScalarMask,
    distanceColorsFlat,
    orthogonal,
    orthogonalMask,
    orthogonalScalarMask,
    sampleField,
)
from ..parser import toContourObjs, toScanObj
from ..storage import (
    clearDataset,
    clearGuavaStore,
    clearResults,
    getDataset,
    getGuavaStore,
    setDataset,
)
from .payload import AlignmentPayload, AnchorPayload, TargetPayload, VisibilityPayload

router = APIRouter(prefix="/api/dataset", tags=["datasets"])

ALL_RESULTS = ("bsd", "disp", "sepd", "divh", "sepdn")


# --- REHYDRATION
@router.get("/all")
def rehydrateDataset():
    A = getDataset("A")
    B = getDataset("B")
    return {
        "A": None if A is None else A.summary(),
        "B": None if B is None else B.summary(),
    }


# --- DATASET
@router.post("/{slot}/dicom")
async def upload_dicom(slot: str, files: list[UploadFile]):
    contents = [await f.read() for f in files]
    try:
        scan = toScanObj(contents)
        dataset = Dataset(slot, scan)
        setDataset(slot, dataset)

    except Exception as exc:
        raise HTTPException(400, f"Error: load dicom series failed: {exc}")

    clearResults(*ALL_RESULTS)
    return dataset.summary()


@router.post("/{slot}/rtstruct")
async def upload_dicom(slot: str, file: UploadFile):
    content = await file.read()
    dataset = getDataset(slot)
    gvStore = getGuavaStore()
    try:
        contours = toContourObjs(slot, content, dataset.scan)
        dataset.contours = contours

        for c in contours.values():
            gvStore["masks"][slot][c.name] = c.mask

    except Exception as exc:
        raise HTTPException(400, f"Error: error while loading rt struct: {exc}")
    if not contours:
        raise HTTPException(400, "Error: no structures found in uploaded struct file.")

    clearResults(*ALL_RESULTS)
    return dataset.summary()


@router.delete("/{slot}")
async def delete_dataset(slot: str):
    clearDataset(slot)
    clearGuavaStore(slot)
    clearResults(*ALL_RESULTS)
    return {"ok": True}


# --- VISIBILITY
@router.put("/{slot}/scan/visibility")
def update_scan_visibility(slot: str, body: VisibilityPayload):
    dataset = getDataset(slot)
    dataset.scan.visible = body.visibility
    return dataset.summary()


@router.put("/{slot}/contour/{id}/visibility")
def update_scan_visibility(slot: str, id: str, body: VisibilityPayload):
    dataset = getDataset(slot)
    dataset.contours[id].visible = body.visibility
    return dataset.summary()


# --- TARGET
@router.put("/{slot}/target")
def update_target(slot: str, body: TargetPayload):
    dataset = getDataset(slot)
    dataset.targetID = body.id
    clearResults("divh", "sepd", "sepdn")
    return dataset.summary()


# --- ANCHOR
# `anchor` picks *which* point (in absolute patient-space mm) gets pinned to the dataset's
# local origin; `alignment` is where that pinned point then sits in world space, relative to
# the (fixed, never-moving) axes at world origin. Choosing a new anchor point resets alignment
# to zero so that point lands exactly on world origin, rather than at a stale offset left over
# from a previous manual translation.
@router.put("/{slot}/anchor")
def update_anchor(slot: str, body: AnchorPayload):
    dataset = getDataset(slot)
    dataset.anchorID = body.id
    dataset.anchor = np.asarray([body.x, body.y, body.z], dtype=float)
    dataset.alignment = np.zeros(3, dtype=float)
    clearResults("disp")
    return dataset.summary()


# --- ALIGNMENT
# Manual translation of the dataset (scan + contours), relative to world origin. The axes
# never move; this offsets where the anchor point (and everything else in the dataset) is
# rendered.
@router.put("/{slot}/alignment")
def update_alignment(slot: str, body: AlignmentPayload):
    dataset = getDataset(slot)
    dataset.alignment = np.asarray([body.x, body.y, body.z], dtype=float)
    return dataset.summary()


# --- SLICE
# registered before the generic /slice/{ax}/{idx} route below, since "arbitrary" would
# otherwise also match that route's {ax} wildcard
@router.get("/{slot}/slice/arbitrary/{idx}")
def getArbitrarySlice(slot: str, idx: int, nx: float, ny: float, nz: float):
    dataset = getDataset(slot)
    return arbitrary(dataset.scan, dataset.anchor, (nx, ny, nz), idx).summary()


@router.get("/{slot}/slice/{ax}/{idx}")
def getOrthogonal(slot: str, ax: str, idx: int):
    dataset = getDataset(slot)
    return orthogonal(dataset.scan, ax, idx).summary()


# --- CONTOUR
@router.get("/{slot}/contour/{id}")
def getContour(slot: str, id: str):
    dataset = getDataset(slot)
    if id not in dataset.contours:
        raise HTTPException(404, f"Error: no contour with id: {id} found")

    contour = dataset.contours[id]
    return {**contour.summary(), **contour.mesh.summary()}


# Contour's 2D cross-section at the same axis/index a scan slice would use, rendered as a
# transparent-background colored overlay (see maskToURL) instead of the full 3D mesh — used
# by the frontend's slice-overlay ("M" key) mode. Same registration-order caveat as the scan
# slice routes above: arbitrary must come first, or {ax} would swallow "arbitrary" too.
@router.get("/{slot}/contour/{id}/slice/arbitrary/{idx}")
def getArbitraryContourSlice(slot: str, id: str, idx: int, nx: float, ny: float, nz: float):
    dataset = getDataset(slot)
    if id not in dataset.contours:
        raise HTTPException(404, f"Error: no contour with id: {id} found")

    contour = dataset.contours[id]
    mask = contour.mask.mask.cpu().numpy()
    return arbitraryMask(dataset.scan, mask, contour.color, dataset.anchor, (nx, ny, nz), idx).summary()


@router.get("/{slot}/contour/{id}/slice/{ax}/{idx}")
def getContourSlice(slot: str, id: str, ax: str, idx: int):
    dataset = getDataset(slot)
    if id not in dataset.contours:
        raise HTTPException(404, f"Error: no contour with id: {id} found")

    contour = dataset.contours[id]
    mask = contour.mask.mask.cpu().numpy()
    return orthogonalMask(dataset.scan, mask, contour.color, ax, idx).summary()


# --- DISTANCE MAP ("DMap" button)
# Visualizes the current target's distance map (guava_rt: Region.target_dmap, i.e.
# target_mask.dmap() — an unsigned Euclidean distance transform of ~target_mask, 0 inside the
# target and growing outward) restricted to a given contour's own shape. No gv.Region needed:
# dataset.contours[targetID].mask *is* the same gv.Mask object the region would build from,
# so calling .dmap() directly reuses its self-caching with no new storage/invalidation wiring.
def _targetDMapField(dataset):
    if dataset.targetID not in dataset.contours:
        raise HTTPException(400, "Error: no target set for this dataset")

    sZ, sY, sX = dataset.scan.spacing  # isometric post-resample -> mm scale factor
    return dataset.contours[dataset.targetID].mask.dmap().cpu().numpy() * sX


# fixed across every contour in the dataset (not per-contour, not per-slice), so the same
# distance value always maps to the same color everywhere: scrolling, switching between the
# 3D mesh and 2D cross-section, and comparing two different contours' DMap renders all stay
# on one consistent scale. Computed over the union of every contour's own voxels (not the raw
# full scan volume) so the range isn't dominated by irrelevant background far outside any
# structure of interest.
def _globalDMapRange(dataset, field):
    masks = [c.mask.mask.cpu().numpy() for c in dataset.contours.values()]
    if not masks:
        return 0.0, 0.0

    union = masks[0]
    for m in masks[1:]:
        union = union | m

    vals = field[union]
    if vals.size == 0:
        return 0.0, 0.0
    return float(vals.min()), float(vals.max())


@router.get("/{slot}/contour/{id}/dmap/mesh")
def getContourDMap(slot: str, id: str):
    dataset = getDataset(slot)
    if id not in dataset.contours:
        raise HTTPException(404, f"Error: no contour with id: {id} found")

    contour = dataset.contours[id]
    field = _targetDMapField(dataset)
    vmin, vmax = _globalDMapRange(dataset, field)

    values = sampleField(dataset.scan, field, contour.mesh.vertices)
    colors = distanceColorsFlat(values, vmin, vmax)

    return {**contour.summary(), **contour.mesh.summary(), "colors": colors}


# same registration-order caveat as the plain contour-slice routes above: arbitrary must
# come first, or the generic {ax} route below would swallow "arbitrary" too.
@router.get("/{slot}/contour/{id}/dmap/slice/arbitrary/{idx}")
def getArbitraryContourDMap(slot: str, id: str, idx: int, nx: float, ny: float, nz: float):
    dataset = getDataset(slot)
    if id not in dataset.contours:
        raise HTTPException(404, f"Error: no contour with id: {id} found")

    contour = dataset.contours[id]
    field = _targetDMapField(dataset)
    mask = contour.mask.mask.cpu().numpy()
    vmin, vmax = _globalDMapRange(dataset, field)

    return arbitraryScalarMask(
        dataset.scan, mask, field, vmin, vmax, dataset.anchor, (nx, ny, nz), idx
    ).summary()


@router.get("/{slot}/contour/{id}/dmap/slice/{ax}/{idx}")
def getContourDMapSlice(slot: str, id: str, ax: str, idx: int):
    dataset = getDataset(slot)
    if id not in dataset.contours:
        raise HTTPException(404, f"Error: no contour with id: {id} found")

    contour = dataset.contours[id]
    field = _targetDMapField(dataset)
    mask = contour.mask.mask.cpu().numpy()
    vmin, vmax = _globalDMapRange(dataset, field)

    return orthogonalScalarMask(dataset.scan, mask, field, vmin, vmax, ax, idx).summary()


@router.get("/{slot}/nearside/{id}")
def getNearside(slot: str, id: str):
    return
