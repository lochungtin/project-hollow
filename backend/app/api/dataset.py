from fastapi import APIRouter, HTTPException, Request, UploadFile
from pydantic import BaseModel

from ..models.dataset import Dataset
from ..parser import toContourObjs, toScanObj
from ..storage import clearDataset, getDataset, setDataset

router = APIRouter(prefix="/api", tags=["datasets"])


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
    try:
        contours = toContourObjs(content, dataset.scan)
        dataset.contours = contours

    except Exception as exc:
        raise HTTPException(400, f"Error: error while loading rt struct: {exc}")
    if not contours:
        raise HTTPException(400, "Error: no structures found in uploaded struct file.")

    return dataset.summary()


@router.delete("/{slot}")
async def delete_dataset(slot: str):
    clearDataset(slot)
    return {"ok": True}


class VisibilityPayload(BaseModel):
    visibility: bool


@router.put("/{slot}/scan/visibility")
def update_scan_visibility(slot: str, body: VisibilityPayload):
    dataset = getDataset(slot)
    dataset.scan.visible = body.visibility
    return dataset.summary()
