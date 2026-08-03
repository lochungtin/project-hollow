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
def getDeviceInfo():
    return getDevice()


@router.get("/results")
def rehydrateResults():
    return getResults()


@router.get("/queue/{job}")
async def triggerOperation(job: str):
    try:
        name, fn = JOB_LIST[job]
    except:
        raise HTTPException(404, f"Unknown operation '{job}'")

    job = QUEUE.launch(name, job, fn)
    return job.summary()
