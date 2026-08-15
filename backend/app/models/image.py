import base64
from dataclasses import dataclass
from io import BytesIO

import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion, map_coordinates


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


def _orthogonalGeometry(scan, ax, idx):
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


def _orthogonalSlice(array, ax, idx):
    if ax == "axial":
        return array[idx, :, :]
    elif ax == "coronal":
        return array[:, idx, :]
    else:
        return array[:, :, idx]


def orthogonal(scan, ax, idx):
    idx, c, dU, dV, width, height = _orthogonalGeometry(scan, ax, idx)
    img = _orthogonalSlice(scan.array, ax, idx)
    return Slice(url=toURL(img), center=c, dU=dU, dV=dV, width=width, height=height)


# Cross-section of a contour's boolean mask (same shape/spacing/origin as scan.array — see
# parser.toContourObjs) along the same cardinal axis/index as a scan slice, rendered as a
# transparent-background colored overlay instead of a grayscale image.
def orthogonalMask(scan, mask, color, ax, idx):
    idx, c, dU, dV, width, height = _orthogonalGeometry(scan, ax, idx)
    img = _orthogonalSlice(mask, ax, idx)
    return Slice(url=maskToURL(img, color), center=c, dU=dU, dV=dV, width=width, height=height)


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


# Sample-coordinate grid for an arbitrary-orientation plane through `anchor` (absolute
# patient-space mm — the point that maps to world origin), offset along `normal` by `idx`
# isometric-voxel steps. `dim` is sized to the volume's bounding-box diagonal so the whole
# scan is covered regardless of the plane's orientation, matching how the frontend
# independently derives the same bound for scroll limits/black-frame placeholders (see
# scene/scan.ts::arbitrarySliceGeometry) without a round-trip. Shared by arbitrary() and
# arbitraryMask() — the coordinate grid itself doesn't depend on which array gets sampled.
def _arbitraryGrid(scan, anchor, normal, idx):
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

    extent = dim * spacing
    return (ptsZ, ptsY, ptsX), center, u, v, extent


def arbitrary(scan, anchor, normal, idx):
    pts, center, u, v, extent = _arbitraryGrid(scan, anchor, normal, idx)

    sampled = map_coordinates(
        scan.array,
        pts,
        order=1,
        mode="constant",
        cval=float(scan.array.min()),
    )

    return Slice(
        url=toURL(sampled),
        center=tuple(center.tolist()),
        dU=tuple(u.tolist()),
        dV=tuple(v.tolist()),
        width=extent,
        height=extent,
    )


# Arbitrary-orientation cross-section of a contour's boolean mask, positioned identically to
# arbitrary() (same _arbitraryGrid call) so the overlay lines up pixel-for-pixel with the
# scan slice it's drawn on top of. order=0 (nearest) instead of arbitrary()'s order=1
# (linear) — the source is boolean and shouldn't blur into fractional values at edges.
def arbitraryMask(scan, mask, color, anchor, normal, idx):
    pts, center, u, v, extent = _arbitraryGrid(scan, anchor, normal, idx)

    sampled = map_coordinates(
        mask.astype(np.uint8),
        pts,
        order=0,
        mode="constant",
        cval=0,
    ) > 0

    return Slice(
        url=maskToURL(sampled, color),
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


# Transparent-background colored overlay for a 2D boolean mask: interior at 0.4 opacity,
# a one-voxel boundary ring (mask minus its erosion, same technique guava_rt.Mask.surface()
# uses in 3D) at 0.6 opacity, fully transparent everywhere else. A mask with no True pixels
# (contour doesn't intersect this slice) naturally produces an all-transparent image.
def maskToURL(mask, color):
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


# --- Distance-map visualization ("DMap" button)
# Red (small values) -> blue (large values), passing through purple at the midpoint since
# red and blue are both partially present there — a direct, literal reading of "red small,
# blue large" rather than a borrowed perceptual colormap.
def _distanceColor(t):
    t = np.clip(t, 0.0, 1.0)
    r = ((1.0 - t) * 255.0).astype(np.uint8)
    b = (t * 255.0).astype(np.uint8)
    g = np.zeros_like(r)
    return r, g, b


def _normalize(values, vmin, vmax):
    if vmax - vmin < 1e-6:
        return np.zeros_like(values, dtype=np.float64)
    return np.clip((values - vmin) / (vmax - vmin), 0.0, 1.0)


# fieldToURL is maskToURL's distance-map counterpart: same interior/boundary alpha split,
# but RGB comes from the colormap above evaluated per-pixel on `field`, instead of a flat
# `color` tuple.
def fieldToURL(mask, field, vmin, vmax):
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


# Cardinal-axis distance-map cross-section: `field` (a full-volume scalar array, same shape
# as `mask`/scan.array) sliced identically to `mask`, colorized via fieldToURL instead of a
# flat contour color. `vmin`/`vmax` are passed in (computed by the caller from the full 3D
# masked field) rather than recomputed per-slice, so the color scale stays fixed as the user
# scrolls instead of renormalizing every frame.
def orthogonalScalarMask(scan, mask, field, vmin, vmax, ax, idx):
    idx, c, dU, dV, width, height = _orthogonalGeometry(scan, ax, idx)
    maskImg = _orthogonalSlice(mask, ax, idx)
    fieldImg = _orthogonalSlice(field, ax, idx)
    return Slice(url=fieldToURL(maskImg, fieldImg, vmin, vmax), center=c, dU=dU, dV=dV, width=width, height=height)


# Arbitrary-orientation counterpart to orthogonalScalarMask, positioned identically to
# arbitraryMask/arbitrary() (same _arbitraryGrid call). The mask is sampled with order=0
# (nearest) like arbitraryMask, the scalar field with order=1 (linear) like arbitrary() uses
# for the grayscale scan.
def arbitraryScalarMask(scan, mask, field, vmin, vmax, anchor, normal, idx):
    pts, center, u, v, extent = _arbitraryGrid(scan, anchor, normal, idx)

    maskSampled = map_coordinates(mask.astype(np.uint8), pts, order=0, mode="constant", cval=0) > 0
    fieldSampled = map_coordinates(field, pts, order=1, mode="nearest")

    return Slice(
        url=fieldToURL(maskSampled, fieldSampled, vmin, vmax),
        center=tuple(center.tolist()),
        dU=tuple(u.tolist()),
        dV=tuple(v.tolist()),
        width=extent,
        height=extent,
    )


# Interpolated lookup of a full-volume scalar field (e.g. a distance map) at a mesh's own
# vertices. Mesh vertices are already in patient-space mm (see models/mesh.py::Mesh.fromArr);
# this inverts that same origin/spacing mapping back to fractional voxel indices instead of
# touching marching-cubes internals.
def sampleField(scan, field, verticesMM):
    verts = np.asarray(verticesMM, dtype=np.float64).reshape(-1, 3)
    oX, oY, oZ = scan.origin
    sZ, sY, sX = scan.spacing

    idxX = (verts[:, 0] - oX) / sX
    idxY = (verts[:, 1] - oY) / sY
    idxZ = (verts[:, 2] - oZ) / sZ

    return map_coordinates(field, [idxZ, idxY, idxX], order=1, mode="nearest")


# Per-vertex color payload for the 3D DMap mesh response: flattened [r,g,b,r,g,b,...] to
# align 1:1 with Mesh.summary()'s flattened `vertices` list.
def distanceColorsFlat(values, vmin, vmax):
    r, g, b = _distanceColor(_normalize(np.asarray(values), vmin, vmax))
    colors = np.empty(r.size * 3, dtype=np.uint8)
    colors[0::3] = r
    colors[1::3] = g
    colors[2::3] = b
    return colors.tolist()
