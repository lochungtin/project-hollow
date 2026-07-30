from fastapi import APIRouter

from ..storage import getDevice

router = APIRouter(prefix="/api", tags=["jobs"])


@router.get("/device")
def getDeviceInfo():
    return getDevice()
