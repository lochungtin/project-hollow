import base64
from dataclasses import dataclass
from io import BytesIO

import numpy as np
from PIL import Image


@dataclass
class Slice:
    url: str
    center: tuple[float, float, float]
    dU: tuple[float, float, float]
    dV: tuple[float, float, float]
    width: float
    height: float

    def summary(self):
        return {
            "url": self.url,
            "center": list(self.center),
            "dU": list(self.dU),
            "dV": list(self.dV),
            "width": self.width,
            "height": self.height,
        }


def orthogonal(scan, ax, idx):
    z, y, x = scan.shape
    sZ, sY, sX = scan.spacing
    oX, oY, oZ = scan.origin
    # oX, oY, oZ = 0, 0, 0
    idx = max(0, min(idx, {"axial": z, "coronal": y, "sagittal": x}[ax] - 1))

    shX = (x - 1) * sX
    shY = (y - 1) * sY
    shZ = (z - 1) * sZ
    dims = {"axial": (shX, shY), "coronal": (shX, shZ), "sagittal": (shY, shZ)}[ax]

    cX = oX + shX / 2.0
    cY = oY + shY / 2.0
    cZ = oZ + shZ / 2.0

    idxX = oX + idx * sX
    idxY = oY + idx * sY
    idxZ = oZ + idx * sZ

    c = {
        "axial": (cX, cY, idxZ),
        "coronal": (cX, idxY, cZ),
        "sagittal": (idxX, cY, cZ),
    }[ax]
    dU = {"axial": (1, 0, 0), "coronal": (1, 0, 0), "sagittal": (0, 1, 0)}[ax]
    dV = {"axial": (0, 1, 0), "coronal": (0, 0, 1), "sagittal": (0, 0, 1)}[ax]

    if ax == "axial":
        img = scan.array[idx, :, :]
    elif ax == "coronal":
        img = scan.array[:, idx, :]
    else:
        img = scan.array[:, :, idx]

    return Slice(url=toURL(img), center=c, dU=dU, dV=dV, width=dims[0], height=dims[1])


def toURL(arr):
    mn, mx = float(arr.min()), float(arr.max())
    if mx - mn < 1e-6:
        norm = np.zeros_like(arr, np.uint8)
    else:
        norm = ((arr - mn) / (mx - mn) * 255.0).astype(np.uint8)

    buffer = BytesIO()
    Image.fromarray(norm, mode="L").save(buffer, format="PNG")
    rt = f"data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode("ascii")}"
    return rt
