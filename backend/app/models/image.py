import base64
from dataclasses import dataclass
from io import BytesIO
from typing import Literal

import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion, map_coordinates

from .scan import Scan

Vec3 = tuple[float, float, float]
Axis = Literal["axial", "coronal", "sagittal"]
Color = tuple[int, int, int]


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


def _orthogonalGeometry(scan: Scan, ax: Axis, idx: int) -> tuple[int, Vec3, Vec3, Vec3, float, float]:
    """Compute a cardinal-axis slice's clamped index, center, dU/dV, and in-plane dimensions."""
    z, y, x = scan.shape
    sZ, sY, sX = scan.spacing
    oX, oY, oZ = scan.origin
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

    return idx, c, dU, dV, dims[0], dims[1]


def _orthogonalSlice(array: np.ndarray, ax: Axis, idx: int) -> np.ndarray:
    """Index a 3D array along the given cardinal axis at `idx`."""
    if ax == "axial":
        return array[idx, :, :]
    elif ax == "coronal":
        return array[:, idx, :]
    else:
        return array[:, :, idx]


def orthogonal(scan: Scan, ax: Axis, idx: int) -> Slice:
    """Extract a grayscale cardinal-axis slice of the scan as a `Slice`."""
    idx, c, dU, dV, width, height = _orthogonalGeometry(scan, ax, idx)
    img = _orthogonalSlice(scan.array, ax, idx)
    return Slice(url=_toURL(img), center=c, dU=dU, dV=dV, width=width, height=height)


def orthogonalMask(scan: Scan, mask: np.ndarray, color: Color, ax: Axis, idx: int) -> Slice:
    """Extract a cardinal-axis cross-section of a boolean mask as a flat-colored `Slice`."""
    idx, c, dU, dV, width, height = _orthogonalGeometry(scan, ax, idx)
    img = _orthogonalSlice(mask, ax, idx)
    return Slice(
        url=_maskToURL(img, color), center=c, dU=dU, dV=dV, width=width, height=height
    )


def _orthonormalBasis(normal: Vec3) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Build an orthonormal (normal, u, v) frame for an arbitrary slicing plane."""
    n = np.asarray(normal, dtype=float)
    norm = np.linalg.norm(n)
    n = n / norm if norm > 1e-9 else np.array([0.0, 0.0, 1.0])
    ref = np.array([0.0, -1.0, 0.0]) if abs(n[2]) > 0.9 else np.array([0.0, 0.0, -1.0])
    v = ref - np.dot(ref, n) * n
    v = v / np.linalg.norm(v)
    u = np.cross(v, n)
    return n, u, v


def _arbitraryDim(scan: Scan) -> tuple[int, float]:
    """Return the arbitrary-slice image's pixel dimension and isotropic spacing."""
    z, y, x = scan.shape
    sZ, sY, sX = scan.spacing
    spacing = float(sX)

    shX, shY, shZ = (x - 1) * sX, (y - 1) * sY, (z - 1) * sZ
    diag = float(np.sqrt(shX**2 + shY**2 + shZ**2))
    return max(2, int(round(diag / spacing))), spacing


def _arbitraryGrid(
    scan: Scan, anchor: Vec3, normal: Vec3, idx: int
) -> tuple[tuple[np.ndarray, np.ndarray, np.ndarray], np.ndarray, np.ndarray, np.ndarray, float]:
    """Build the voxel-index sampling grid for an arbitrary-orientation plane through `anchor`."""
    n, u, v = _orthonormalBasis(normal)
    dim, spacing = _arbitraryDim(scan)
    oX, oY, oZ = scan.origin
    sZ, sY, sX = scan.spacing

    center = np.asarray(anchor, dtype=float) + n * idx * spacing

    coords = (np.arange(dim) - (dim - 1) / 2.0) * spacing
    rr, cc = np.meshgrid(coords, coords, indexing="ij")

    px = center[0] + cc * u[0] - rr * v[0]
    py = center[1] + cc * u[1] - rr * v[1]
    pz = center[2] + cc * u[2] - rr * v[2]

    ptsZ = (pz - oZ) / sZ
    ptsY = (py - oY) / sY
    ptsX = (px - oX) / sX

    extent = dim * spacing
    return (ptsZ, ptsY, ptsX), center, u, v, extent


def arbitrary(scan: Scan, anchor: Vec3, normal: Vec3, idx: int) -> Slice:
    """Extract a grayscale arbitrary-orientation slice of the scan as a `Slice`."""
    pts, center, u, v, extent = _arbitraryGrid(scan, anchor, normal, idx)

    sampled = map_coordinates(
        scan.array,
        pts,
        order=1,
        mode="constant",
        cval=float(scan.array.min()),
    )

    return Slice(
        url=_toURL(sampled),
        center=tuple(center.tolist()),
        dU=tuple(u.tolist()),
        dV=tuple(v.tolist()),
        width=extent,
        height=extent,
    )


def arbitraryMask(scan: Scan, mask: np.ndarray, color: Color, anchor: Vec3, normal: Vec3, idx: int) -> Slice:
    """Extract an arbitrary-orientation cross-section of a boolean mask as a flat-colored `Slice`."""
    pts, center, u, v, extent = _arbitraryGrid(scan, anchor, normal, idx)

    sampled = (
        map_coordinates(
            mask.astype(np.uint8),
            pts,
            order=0,
            mode="constant",
            cval=0,
        )
        > 0
    )

    return Slice(
        url=_maskToURL(sampled, color),
        center=tuple(center.tolist()),
        dU=tuple(u.tolist()),
        dV=tuple(v.tolist()),
        width=extent,
        height=extent,
    )


def _toURL(arr: np.ndarray) -> str:
    """Encode a 2D grayscale array as a min-max-normalized base64 PNG data URL."""
    mn, mx = float(arr.min()), float(arr.max())
    if mx - mn < 1e-6:
        norm = np.zeros_like(arr, np.uint8)
    else:
        norm = ((arr - mn) / (mx - mn) * 255.0).astype(np.uint8)

    buffer = BytesIO()
    Image.fromarray(norm, mode="L").save(buffer, format="PNG")
    rt = f"data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode("ascii")}"
    return rt


def _maskToURL(mask: np.ndarray, color: Color) -> str:
    """Encode a boolean mask as a transparent PNG, flat-colored with a brighter boundary ring."""
    mask = np.asarray(mask, dtype=bool)
    boundary = mask & ~binary_erosion(mask)
    interior = mask & ~boundary

    rgba = np.zeros((*mask.shape, 4), dtype=np.uint8)
    rgba[interior] = [*color, round(0.4 * 255)]
    rgba[boundary] = [*color, round(0.6 * 255)]

    buffer = BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buffer, format="PNG")
    rt = f"data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode("ascii")}"
    return rt


def _distanceColor(t: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Map normalized values in [0, 1] to an RGB red(small)->blue(large) colormap."""
    t = np.clip(t, 0.0, 1.0)
    r = ((1.0 - t) * 255.0).astype(np.uint8)
    b = (t * 255.0).astype(np.uint8)
    g = np.zeros_like(r)
    return r, g, b


def _normalize(values: np.ndarray, vmin: float, vmax: float) -> np.ndarray:
    """Linearly rescale `values` from `[vmin, vmax]` to `[0, 1]`, clipped, with a flat-range guard."""
    if vmax - vmin < 1e-6:
        return np.zeros_like(values, dtype=np.float64)
    return np.clip((values - vmin) / (vmax - vmin), 0.0, 1.0)


def _fieldToURL(mask: np.ndarray, field: np.ndarray, vmin: float, vmax: float) -> str:
    """Encode a boolean mask as a transparent PNG colored per-pixel by `field` via `_distanceColor`."""
    mask = np.asarray(mask, dtype=bool)
    boundary = mask & ~binary_erosion(mask)
    interior = mask & ~boundary

    r, g, b = _distanceColor(_normalize(field, vmin, vmax))

    rgba = np.zeros((*mask.shape, 4), dtype=np.uint8)
    for ch, plane in enumerate((r, g, b)):
        rgba[..., ch][interior] = plane[interior]
        rgba[..., ch][boundary] = plane[boundary]
    rgba[..., 3][interior] = round(0.4 * 255)
    rgba[..., 3][boundary] = round(0.6 * 255)

    buffer = BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buffer, format="PNG")
    rt = f"data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode("ascii")}"
    return rt


def orthogonalScalarMask(
    scan: Scan, mask: np.ndarray, field: np.ndarray, vmin: float, vmax: float, ax: Axis, idx: int
) -> Slice:
    """Extract a cardinal-axis cross-section of a mask, colored by a scalar `field`, as a `Slice`."""
    idx, c, dU, dV, width, height = _orthogonalGeometry(scan, ax, idx)
    maskImg = _orthogonalSlice(mask, ax, idx)
    fieldImg = _orthogonalSlice(field, ax, idx)
    return Slice(
        url=_fieldToURL(maskImg, fieldImg, vmin, vmax),
        center=c,
        dU=dU,
        dV=dV,
        width=width,
        height=height,
    )


def arbitraryScalarMask(
    scan: Scan, mask: np.ndarray, field: np.ndarray, vmin: float, vmax: float, anchor: Vec3, normal: Vec3, idx: int
) -> Slice:
    """Extract an arbitrary-orientation cross-section of a mask, colored by a scalar `field`."""
    pts, center, u, v, extent = _arbitraryGrid(scan, anchor, normal, idx)

    maskSampled = (
        map_coordinates(mask.astype(np.uint8), pts, order=0, mode="constant", cval=0)
        > 0
    )
    fieldSampled = map_coordinates(field, pts, order=1, mode="nearest")

    return Slice(
        url=_fieldToURL(maskSampled, fieldSampled, vmin, vmax),
        center=tuple(center.tolist()),
        dU=tuple(u.tolist()),
        dV=tuple(v.tolist()),
        width=extent,
        height=extent,
    )


def sampleField(scan: Scan, field: np.ndarray, verticesMM: np.ndarray) -> np.ndarray:
    """Interpolate a scalar volume `field` at a mesh's patient-space mm vertices."""
    verts = np.asarray(verticesMM, dtype=np.float64).reshape(-1, 3)
    oX, oY, oZ = scan.origin
    sZ, sY, sX = scan.spacing

    idxX = (verts[:, 0] - oX) / sX
    idxY = (verts[:, 1] - oY) / sY
    idxZ = (verts[:, 2] - oZ) / sZ

    return map_coordinates(field, [idxZ, idxY, idxX], order=1, mode="nearest")


def distanceColorsFlat(values: np.ndarray, vmin: float, vmax: float) -> list[int]:
    """Colorize `values` via `_distanceColor` into a flattened per-vertex `[r, g, b, ...]` list."""
    r, g, b = _distanceColor(_normalize(np.asarray(values), vmin, vmax))
    colors = np.empty(r.size * 3, dtype=np.uint8)
    colors[0::3] = r
    colors[1::3] = g
    colors[2::3] = b
    return colors.tolist()
