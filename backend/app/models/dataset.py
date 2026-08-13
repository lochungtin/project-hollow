from dataclasses import dataclass, field

import numpy as np

from .contour import Contour
from .scan import Scan

# from .distance_map import DistanceMap
# from .surface import Surface
# from .volume import Volume


@dataclass
class Dataset:
    slot: str
    scan: Scan
    targetID: str = "unknown"
    anchorID: str = "unknown"
    anchor: np.ndarray = field(default_factory=lambda: np.zeros(3, float))
    alignment: np.ndarray = field(default_factory=lambda: np.zeros(3, float))
    contours: dict[str, Contour] = field(default_factory=dict)
    rotation: np.ndarray = field(default_factory=lambda: np.zeros(3, float))

    # surfaces: dict[str, Surface] = {}
    # distance_maps: dict[str, DistanceMap] = {}
    # volume_mesh_cache: dict[float, Mesh] = {}

    def __post_init__(self):
        z, y, x = self.scan.shape
        sZ, sY, sX = self.scan.spacing
        oX, oY, oZ = self.scan.origin
        self.anchor = np.asarray(
            [oX + (x - 1) * sX / 2, oY + (y - 1) * sY / 2, oZ + (z - 1) * sZ / 2]
        )

    def summary(self):
        return {
            "slot": self.slot,
            "scan": self.scan.summary(),
            "targetID": self.targetID,
            "anchorID": self.anchorID,
            "anchor": self.anchor.tolist(),
            "alignment": self.alignment.tolist(),
            "render": {
                "rotation": self.rotation.tolist(),
            },
            "contours": dict((n, c.summary()) for n, c in self.contours.items()),
        }
