from fastapi import APIRouter, HTTPException

from ..guava import getBSD, getDisp, getDiVH, getSepD, getSepDN
from ..storage import QUEUE, getDevice

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


@router.get("/queue/{job}")
async def triggerOperation(job: str):
    try:
        name, fn = JOB_LIST[job]
    except:
        raise HTTPException(404, f"Unknown operation '{job}'")

    job = QUEUE.launch(name, fn)
    return job.summary()


@router.get("/bsd")
def triggerBSD():
    return getBSD()


@router.get("/disp")
def triggerDisp():
    return getDisp()


@router.get("/sepd")
def triggerSepD():
    return getSepD()


@router.get("/divh")
def triggerDiVHD():
    return getDiVH()


@router.get("/sepdn")
def triggerSepDN():
    return getSepDN()
