from copy import deepcopy

from fastapi import APIRouter, HTTPException

from ..guava import getBSD, getDisp, getDiVH, getSepD, getSepDN
from ..storage import QUEUE, getDevice, getResults

router = APIRouter(prefix="/api/guava", tags=["jobs"])


JOB_LIST = {
    "bsd": ["BSD", getBSD],
    "disp": ["DISP", getDisp],
    "sepd": ["SD", getSepD],
    "divh": ["DiVH", getDiVH],
    "sepdn": ["SP-N", getSepDN],
}


@router.get("/device")
def getDeviceInfo() -> str:
    """Return the compute device this server is running GUAVA-RT on."""
    return getDevice()


@router.get("/results")
def rehydrateResults() -> dict:
    """Return every cached analysis result, with DiVH reduced to its structure name list."""
    rt = deepcopy(getResults())
    rt["divh"] = list(rt["divh"].keys())
    return rt


@router.get("/results/divh/{roi}")
def getDiVHResult(roi: str) -> dict | None:
    """Return the cached DiVH result for a single structure name."""
    return getResults("divh").get(roi)


@router.get("/queue/{job}")
async def triggerOperation(job: str) -> dict:
    """Launch the named GUAVA analysis job on the queue and return its initial state."""
    try:
        name, fn = JOB_LIST[job]
    except:
        raise HTTPException(404, f"Unknown operation '{job}'")

    job = QUEUE.launch(name, job, fn)
    return job.summary()
