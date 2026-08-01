from fastapi import APIRouter

from ..guava import getBSD
from ..storage import getDevice

router = APIRouter(prefix="/api/guava", tags=["jobs"])


@router.get("/device")
def getDeviceInfo():
    return getDevice()


@router.get("/bsd")
def triggerBSD():
    return getBSD()
