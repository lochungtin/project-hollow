import base64
from dataclasses import dataclass
from io import BytesIO

import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates


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
    dV = {"axial": (0, -1, 0), "coronal": (0, 0, -1), "sagittal": (0, 0, -1)}[ax]

    if ax == "axial":
        img = scan.array[idx, :, :]
    elif ax == "coronal":
        img = scan.array[:, idx, :]
    else:
        img = scan.array[:, :, idx]

    return Slice(url=toURL(img), center=c, dU=dU, dV=dV, width=dims[0], height=dims[1])


def _orthonormalBasis(normal):
    n = np.asarray(normal, dtype=float)
    norm = np.linalg.norm(n)
    n = n / norm if norm > 1e-9 else np.array([0.0, 0.0, 1.0])

    # `v` (dV) is derived to match the established cardinal convention (axial=(0,-1,0),
    # coronal/sagittal=(0,0,-1)) generalized to any orientation, not an arbitrary helper
    # cross-product — project a fixed "up" reference onto the plane, falling back to the
    # same secondary reference axial itself uses when the plane is too close to axial (SI)
    # for SI to serve as an in-plane "up" direction. This exactly reproduces the established
    # dV at all three cardinal normals (verified: e.g. normal=(0,1,0) -> v=(0,0,-1)).
    ref = np.array([0.0, -1.0, 0.0]) if abs(n[2]) > 0.9 else np.array([0.0, 0.0, -1.0])
    v = ref - np.dot(ref, n) * n
    v = v / np.linalg.norm(v)
    u = np.cross(v, n)  # keeps cross(u, v) == n, matching the front-facing convention
    return n, u, v


def _arbitraryDim(scan):
    z, y, x = scan.shape
    sZ, sY, sX = scan.spacing
    spacing = float(sX)  # isometric after resample (parser._resample)

    shX, shY, shZ = (x - 1) * sX, (y - 1) * sY, (z - 1) * sZ
    diag = float(np.sqrt(shX**2 + shY**2 + shZ**2))
    return max(2, int(round(diag / spacing))), spacing


# Arbitrary-orientation slice through `anchor` (absolute patient-space mm — the point that
# maps to world origin), offset along `normal` by `idx` isometric-voxel steps. `dim` is sized
# to the volume's bounding-box diagonal so the whole scan is covered regardless of the plane's
# orientation, matching how the frontend independently derives the same bound for scroll
# limits/black-frame placeholders (see scene/scan.ts::arbitrarySliceGeometry) without a
# round-trip.
def arbitrary(scan, anchor, normal, idx):
    n, u, v = _orthonormalBasis(normal)
    dim, spacing = _arbitraryDim(scan)
    oX, oY, oZ = scan.origin
    sZ, sY, sX = scan.spacing

    center = np.asarray(anchor, dtype=float) + n * idx * spacing

    coords = (np.arange(dim) - (dim - 1) / 2.0) * spacing
    rr, cc = np.meshgrid(coords, coords, indexing="ij")  # rr: rows, cc: dU (cols)

    # rows sample along -v, not +v: row 0 of the array becomes the *top* of the saved PNG
    # (PIL convention), which — after the texture's vertical flip and the plane mesh's own
    # UV layout — ends up mounted at world direction +v (dV). Sampling row-increasing along
    # -v keeps that mounted content anatomically correct instead of mirrored across "up".
    # This matches the cardinal axes: e.g. axial's array row axis increases along +Y while
    # its reported dV is -Y — dV is always the negation of the array's row-increasing
    # direction, not the same direction.
    px = center[0] + cc * u[0] - rr * v[0]
    py = center[1] + cc * u[1] - rr * v[1]
    pz = center[2] + cc * u[2] - rr * v[2]

    ptsZ = (pz - oZ) / sZ
    ptsY = (py - oY) / sY
    ptsX = (px - oX) / sX

    sampled = map_coordinates(
        scan.array,
        [ptsZ, ptsY, ptsX],
        order=1,
        mode="constant",
        cval=float(scan.array.min()),
    )

    extent = dim * spacing
    return Slice(
        url=toURL(sampled),
        center=tuple(center.tolist()),
        dU=tuple(u.tolist()),
        dV=tuple(v.tolist()),
        width=extent,
        height=extent,
    )


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
