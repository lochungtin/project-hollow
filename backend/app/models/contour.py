import uuid
from dataclasses import dataclass, field
from typing import Optional

import guava_rt as gv
import numpy as np

from .mesh import Mesh


@dataclass
class Contour:
    name: str
    number: int
    color: tuple[int, int, int]
    mask: gv.Mask
    center_of_mass: tuple[float, float, float]
    mesh: Optional[Mesh] = None
    visible: bool = True
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])

    def summary(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "number": self.number,
            "color": list(self.color),
            "visible": self.visible,
            "has_mesh": self.mesh is not None,
            "volume": self.mask.volume.cpu().item(),
            "surface_area": self.mask.surface_area().cpu().item(),
            "center_of_mass": list(self.center_of_mass),
        }
