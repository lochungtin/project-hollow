from pydantic import BaseModel


class VisibilityPayload(BaseModel):
    visibility: bool


class AnchorPayload(BaseModel):
    x: float
    y: float
    z: float
