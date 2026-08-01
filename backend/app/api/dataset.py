import numpy as np
from fastapi import APIRouter, HTTPException, UploadFile

from ..models.dataset import Dataset
from ..parser import toContourObjs, toScanObj
from ..storage import (
    clearDataset,
    clearGuavaStore,
    getDataset,
    getGuavaStore,
    setDataset,
)
from .payload import AnchorPayload, TargetPayload, VisibilityPayload

router = APIRouter(prefix="/api/dataset", tags=["datasets"])


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

    return dataset.summary()


@router.post("/{slot}/rtstruct")
async def upload_dicom(slot: str, file: UploadFile):
    content = await file.read()
    dataset = getDataset(slot)
    gvStore = getGuavaStore()
    try:
        contours = toContourObjs(content, dataset.scan)
        dataset.contours = contours

        for c in contours.values():
            gvStore["masks"][slot][c.name] = c.mask

    except Exception as exc:
        raise HTTPException(400, f"Error: error while loading rt struct: {exc}")
    if not contours:
        raise HTTPException(400, "Error: no structures found in uploaded struct file.")

    return dataset.summary()


@router.delete("/{slot}")
async def delete_dataset(slot: str):
    clearDataset(slot)
    clearGuavaStore(slot)
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
def update_scan_visibility(slot: str, body: TargetPayload):
    dataset = getDataset(slot)
    dataset.targetID = body.id
    return dataset.summary()


# --- ANCHOR
@router.put("/{slot}/anchor")
def update_scan_visibility(slot: str, body: AnchorPayload):
    dataset = getDataset(slot)
    dataset.anchorID = body.id
    print(dataset.anchorID)
    dataset.anchor = np.asarray([body.x, body.y, body.z]).astype(int)
    return dataset.summary()
