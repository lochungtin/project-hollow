from fastapi import APIRouter, HTTPException, UploadFile

from ..models.dataset import Dataset
from ..parser import toScanObj
from ..storage import clearDataset, setDataset

router = APIRouter(prefix="/api", tags=["datasets"])


@router.post("/{slot}/dicom")
async def upload_dicom(slot: str, files: list[UploadFile]):
    contents = [await f.read() for f in files]
    try:
        scan = toScanObj(contents)
    except Exception as exc:
        raise HTTPException(400, f"Error: load dicom series failed: {exc}")

    dataset = Dataset(slot, scan)
    setDataset(slot, dataset)

    return dataset.summary()


@router.delete("/{slot}")
async def delete_dicom(slot: str):
    clearDataset(slot)
    return {"ok": True}
