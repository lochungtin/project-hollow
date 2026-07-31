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
    anchor: np.ndarray = field(default_factory=lambda: np.zeros(3, float))
    alignment: np.ndarray = field(default_factory=lambda: np.zeros(3, float))
    contours: dict[str, Contour] = field(default_factory=dict)
    # surfaces: dict[str, Surface] = {}
    # distance_maps: dict[str, DistanceMap] = {}
    volume_vis: bool = False
    rotation: np.ndarray = field(default_factory=lambda: np.zeros(3, float))
    # volume_mesh_cache: dict[float, Mesh] = {}

    def __post_init__(self):
        self.anchor = np.asarray(self.scan.shape) // 2

    def summary(self):
        return {
            "slot": self.slot,
            "scan": self.scan.summary(),
            "anchor": self.anchor.tolist(),
            "alignment": self.alignment.tolist(),
            "render": {
                "rotation": self.rotation.tolist(),
                "volume_visible": self.volume_vis,
            },
            "contours": dict((n, c.summary()) for n, c in self.contours.items()),
        }
