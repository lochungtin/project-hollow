import guava_rt as gv
import numpy as np
from fastapi import APIRouter, HTTPException, UploadFile

from ..models.dataset import Dataset
from ..models.image import (
    Axis,
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


@router.get("/all")
def rehydrateDataset() -> dict:
    """Return both slots' current datasets (or `None`) for client-side rehydration on load."""
    A = getDataset("A")
    B = getDataset("B")
    return {
        "A": None if A is None else A.summary(),
        "B": None if B is None else B.summary(),
    }


@router.post("/{slot}/dicom")
async def uploadDicom(slot: str, files: list[UploadFile]) -> dict:
    """Parse an uploaded DICOM series into a new `Dataset` for `slot`, replacing any prior one."""
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
async def uploadRTStruct(slot: str, file: UploadFile) -> dict:
    """Parse an uploaded RTSTRUCT into `slot`'s dataset and register its masks with GUAVA."""
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
async def deleteDataset(slot: str) -> dict:
    """Remove `slot`'s dataset, GUAVA masks/region, and every cached analysis result."""
    clearDataset(slot)
    clearGuavaStore(slot)
    clearResults(*ALL_RESULTS)
    return {"ok": True}


@router.put("/{slot}/scan/visibility")
def updateScanVisibility(slot: str, body: VisibilityPayload) -> dict:
    """Set whether `slot`'s scan plane is rendered."""
    dataset = getDataset(slot)
    dataset.scan.visible = body.visibility
    return dataset.summary()


@router.put("/{slot}/contour/{id}/visibility")
def updateContourVisibility(slot: str, id: str, body: VisibilityPayload) -> dict:
    """Set whether a single contour is rendered."""
    dataset = getDataset(slot)
    dataset.contours[id].visible = body.visibility
    return dataset.summary()


@router.put("/{slot}/target")
def updateTarget(slot: str, body: TargetPayload) -> dict:
    """Set `slot`'s target ROI and invalidate the analyses that depend on it."""
    dataset = getDataset(slot)
    dataset.targetID = body.id
    clearResults("divh", "sepd", "sepdn")
    return dataset.summary()


@router.put("/{slot}/anchor")
def updateAnchor(slot: str, body: AnchorPayload) -> dict:
    """Pin a new absolute-mm point as `slot`'s anchor and reset its alignment to zero."""
    dataset = getDataset(slot)
    dataset.anchorID = body.id
    dataset.anchor = np.asarray([body.x, body.y, body.z], dtype=float)
    dataset.alignment = np.zeros(3, dtype=float)
    clearResults("disp")
    return dataset.summary()


@router.put("/{slot}/alignment")
def updateAlignment(slot: str, body: AlignmentPayload) -> dict:
    """Set `slot`'s manual world-origin offset."""
    dataset = getDataset(slot)
    dataset.alignment = np.asarray([body.x, body.y, body.z], dtype=float)
    return dataset.summary()


@router.get("/{slot}/slice/arbitrary/{idx}")
def getArbitrarySlice(slot: str, idx: int, nx: float, ny: float, nz: float) -> dict:
    """Return a grayscale arbitrary-orientation scan slice through `slot`'s anchor."""
    dataset = getDataset(slot)
    return arbitrary(dataset.scan, dataset.anchor, (nx, ny, nz), idx).summary()


@router.get("/{slot}/slice/{ax}/{idx}")
def getOrthogonal(slot: str, ax: Axis, idx: int) -> dict:
    """Return a grayscale cardinal-axis scan slice."""
    dataset = getDataset(slot)
    return orthogonal(dataset.scan, ax, idx).summary()


@router.get("/{slot}/contour/{id}")
def getContour(slot: str, id: str) -> dict:
    """Return a contour's metadata and full 3D surface mesh."""
    dataset = getDataset(slot)
    if id not in dataset.contours:
        raise HTTPException(404, f"Error: no contour with id: {id} found")

    contour = dataset.contours[id]
    return {**contour.summary(), **contour.mesh.summary()}


@router.get("/{slot}/contour/{id}/slice/arbitrary/{idx}")
def getArbitraryContourSlice(slot: str, id: str, idx: int, nx: float, ny: float, nz: float) -> dict:
    """Return a flat-colored arbitrary-orientation cross-section of a contour."""
    dataset = getDataset(slot)
    if id not in dataset.contours:
        raise HTTPException(404, f"Error: no contour with id: {id} found")

    contour = dataset.contours[id]
    mask = contour.mask.mask.cpu().numpy()
    return arbitraryMask(dataset.scan, mask, contour.color, dataset.anchor, (nx, ny, nz), idx).summary()


@router.get("/{slot}/contour/{id}/slice/{ax}/{idx}")
def getContourSlice(slot: str, id: str, ax: Axis, idx: int) -> dict:
    """Return a flat-colored cardinal-axis cross-section of a contour."""
    dataset = getDataset(slot)
    if id not in dataset.contours:
        raise HTTPException(404, f"Error: no contour with id: {id} found")

    contour = dataset.contours[id]
    mask = contour.mask.mask.cpu().numpy()
    return orthogonalMask(dataset.scan, mask, contour.color, ax, idx).summary()


def _targetDMapField(dataset: Dataset) -> np.ndarray:
    """Return `dataset`'s target distance map in mm, or raise 400 if no target is set."""
    if dataset.targetID not in dataset.contours:
        raise HTTPException(400, "Error: no target set for this dataset")

    sZ, sY, sX = dataset.scan.spacing
    return dataset.contours[dataset.targetID].mask.dmap().cpu().numpy() * sX


def _globalDMapRange(dataset: Dataset, field: np.ndarray) -> tuple[float, float]:
    """Return `field`'s (min, max) over every contour's voxels, for a dataset-wide color scale."""
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
def getContourDMap(slot: str, id: str) -> dict:
    """Return a contour's mesh with per-vertex colors from the target's distance map."""
    dataset = getDataset(slot)
    if id not in dataset.contours:
        raise HTTPException(404, f"Error: no contour with id: {id} found")

    contour = dataset.contours[id]
    field = _targetDMapField(dataset)
    vmin, vmax = _globalDMapRange(dataset, field)

    values = sampleField(dataset.scan, field, contour.mesh.vertices)
    colors = distanceColorsFlat(values, vmin, vmax)

    return {**contour.summary(), **contour.mesh.summary(), "colors": colors}


@router.get("/{slot}/contour/{id}/dmap/slice/arbitrary/{idx}")
def getArbitraryContourDMap(slot: str, id: str, idx: int, nx: float, ny: float, nz: float) -> dict:
    """Return an arbitrary-orientation cross-section of a contour colored by distance to target."""
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
def getContourDMapSlice(slot: str, id: str, ax: Axis, idx: int) -> dict:
    """Return a cardinal-axis cross-section of a contour colored by distance to target."""
    dataset = getDataset(slot)
    if id not in dataset.contours:
        raise HTTPException(404, f"Error: no contour with id: {id} found")

    contour = dataset.contours[id]
    field = _targetDMapField(dataset)
    mask = contour.mask.mask.cpu().numpy()
    vmin, vmax = _globalDMapRange(dataset, field)

    return orthogonalScalarMask(dataset.scan, mask, field, vmin, vmax, ax, idx).summary()


@router.get("/{slot}/nearside/{id}")
def getNearside(slot: str, id: str) -> None:
    """Unimplemented placeholder for a contour's nearside surface."""
    return
