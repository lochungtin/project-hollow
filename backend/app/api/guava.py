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
def getDeviceInfo():
    return getDevice()


@router.get("/results")
def rehydrateResults():
    rt = deepcopy(getResults())
    rt["divh"] = list(rt["divh"].keys())
    return rt


@router.get("/results/divh/{roi}")
def getDiVHResult(roi):
    return getResults("divh").get(roi)


@router.get("/queue/{job}")
async def triggerOperation(job: str):
    try:
        name, fn = JOB_LIST[job]
    except:
        raise HTTPException(404, f"Unknown operation '{job}'")

    job = QUEUE.launch(name, job, fn)
    return job.summary()
