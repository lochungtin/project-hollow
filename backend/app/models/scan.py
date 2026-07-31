import uuid
from dataclasses import dataclass, field

import numpy as np


@dataclass
class Scan:
    array: np.ndarray
    spacing: tuple[float, float, float]
    origin: tuple[float, float, float]
    modality: str = "N/A"
    visible: bool = True
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])

    @property
    def shape(self):
        return tuple(int(s) for s in self.array.shape)

    @property
    def range(self):
        return float(self.array.min()), float(self.array.max())

    def summary(self) -> dict:
        return {
            "id": self.id,
            "shape": list(self.shape),
            "spacing": list(self.spacing),
            "modality": self.modality,
            "range": list(self.range),
            "visible": self.visible,
        }
