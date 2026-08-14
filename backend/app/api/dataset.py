import guava_rt as gv
import numpy as np
from fastapi import APIRouter, HTTPException, UploadFile

from ..models.dataset import Dataset
from ..models.image import arbitrary, orthogonal
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


@router.get("/{slot}/nearside/{id}")
def getNearside(slot: str, id: str):
    return
