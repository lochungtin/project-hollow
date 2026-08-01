from pydantic import BaseModel


class VisibilityPayload(BaseModel):
    visibility: bool


class TargetPayload(BaseModel):
    id: str


class AnchorPayload(BaseModel):
    x: float
    y: float
    z: float
    id: str
