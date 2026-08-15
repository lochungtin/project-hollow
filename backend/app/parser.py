from colorsys import hls_to_rgb
from io import BytesIO

import guava_rt as gv
import numpy as np
import pydicom as dcm
from scipy.ndimage import zoom as ndi_zoom
from skimage.draw import polygon2mask

from .models.contour import Contour
from .models.mesh import Mesh
from .models.scan import Scan
from .storage import getDevice


# --- Dicom Series
def _byteToSlices(filesBytes):
    rt = []
    for b in filesBytes:
        try:
            rt.append(dcm.dcmread(BytesIO(b), force=True))
        except Exception:
            continue
    return [d for d in rt if hasattr(d, "PixelData")]


def _sortSlices(raw):
    iop = getattr(raw[0], "ImageOrientationPatient", [1, 0, 0, 0, 1, 0])
    iop = np.asarray(iop, float)

    row_dir = iop[0:3]
    col_dir = iop[3:6]
    n = np.cross(row_dir, col_dir)
    norm = np.linalg.norm(n)
    norm = n / norm if norm > 0 else np.array([0.0, 0.0, 1.0])

    rt = []
    for d in raw:
        ino = float(getattr(d, "InstanceNumber", 0))
        ipp = np.asarray(getattr(d, "ImagePositionPatient", [0.0, 0.0, ino]), float)
        rt.append({"data": d, "ipp": ipp, "normal": float(np.dot(ipp, norm))})

    return sorted(rt, key=lambda s: s["normal"])


def _buildVolume(slices, shape):
    rt = np.zeros(shape, dtype=np.float32)
    for i, s in enumerate(slices):
        arr = s["data"].pixel_array.astype(np.float32)

        slope = float(getattr(s["data"], "RescaleSlope", 1.0))
        intercept = float(getattr(s["data"], "RescaleIntercept", 0.0))
        rt[i] = arr * slope + intercept

    return rt


def _getSpacing(slices, first):
    spacing = np.asarray(getattr(first, "PixelSpacing", [1.0, 1.0]), float)

    if len(slices) > 1:
        deltas = np.diff([s["normal"] for s in slices])
        sZ = float(np.median(np.abs(deltas)))
        if sZ <= 1e-6:
            sZ = float(getattr(first, "SliceThickness", 1.0))
    else:
        sZ = float(getattr(first, "SliceThickness", 1.0))

    return (sZ, float(spacing[0]), float(spacing[1]))


def _resample(volume, spacing):
    factor = spacing / np.min(spacing)
    if any(abs(f - 1.0) > 1e-3 for f in factor):
        return ndi_zoom(volume, factor, order=1, mode="nearest")
    return volume


def toScanObj(filesBytes):
    if not filesBytes:
        raise ValueError("No DICOM files provided")

    raw = _byteToSlices(filesBytes)
    if not raw:
        raise ValueError("None of the provided files contain image pixel data")

    first = raw[0]
    slices = _sortSlices(raw)

    volume = _buildVolume(slices, (len(slices), int(first.Rows), int(first.Columns)))
    spacing = _getSpacing(slices, first)
    origin = tuple(float(slices[0]["ipp"][i]) for i in range(3))

    return Scan(
        array=_resample(volume, spacing).astype(np.float32),
        spacing=spacing,
        origin=origin,
        modality=str(getattr(first, "Modality", "UNKNOWN")),
    )


# --- RTStruct
# low-discrepancy multipliers (irrational, so `index * step mod 1` stays spread out across
# contours instead of clustering short-range, even for structures adjacent in the RTSTRUCT's
# own ordering) — one per HLS channel so hue/lightness/saturation don't co-vary in lockstep
_HUE_STEP = 0.6180339887498949  # golden ratio conjugate
_LGT_STEP = 0.4142135623730951  # sqrt(2) - 1
_SAT_STEP = 0.7320508075688772  # sqrt(3) - 1

# dataset A -> red/purple/blue, dataset B -> yellow/green/dark green: disjoint hue bands
# (colorsys's hue wheel: 0=red, 1/6=yellow, 1/3=green, 1/2=cyan, 2/3=blue, 5/6=magenta), each
# spanning half the wheel so the two datasets stay visually distinguishable at a glance, not
# just contour-by-contour, while individual contours within a dataset still read as clearly
# different colors (red vs. purple vs. blue; yellow vs. green vs. dark green)
_HUE_RANGES = {"A": (0.58, 1.00), "B": (0.13, 0.42)}


def _contourColor(slot, index):
    loH, hiH = _HUE_RANGES.get(slot, (0.0, 1.0))
    h = loH + ((index * _HUE_STEP) % 1.0) * (hiH - loH)
    l = 0.32 + ((index * _LGT_STEP) % 1.0) * 0.36  # wide enough for a "dark green"-style low end, never near-black
    s = 0.55 + ((index * _SAT_STEP) % 1.0) * 0.40  # stay vivid, never washed out
    return [int(v * 255) for v in hls_to_rgb(h, l, s)]


def toContourObjs(slot, fileBytes, scan):
    structSet = dcm.dcmread(BytesIO(fileBytes), force=True)

    roi_names = {}
    for item in getattr(structSet, "StructureSetROISequence", []):
        roi_names[int(item.ROINumber)] = str(item.ROIName)

    contours = {}
    depth, height, width = scan.shape
    sZ, sY, sX = scan.spacing
    oX, oY, oZ = scan.origin

    for i, roi_item in enumerate(getattr(structSet, "ROIContourSequence", [])):
        number = int(roi_item.ReferencedROINumber)
        name = roi_names.get(number, f"contour_{number}")

        color = _contourColor(slot, i)

        mask = np.zeros((depth, height, width), dtype=bool)
        contour_seq = getattr(roi_item, "ContourSequence", [])
        for contour_item in contour_seq:
            data = np.array(contour_item.ContourData, dtype=float).reshape(-1, 3)
            if data.shape[0] < 3:
                continue

            sIdx = int(round((float(data[0, 2]) - oZ) / sZ))
            if sIdx < 0 or sIdx >= depth:
                continue

            row = (data[:, 1] - oY) / sY
            col = (data[:, 0] - oX) / sX
            try:
                sMask = polygon2mask((height, width), np.stack([row, col], axis=1))
            except Exception:
                continue

            mask[sIdx] |= sMask

        if not mask.any():
            continue

        gvMask = gv.Mask(mask, getDevice())

        # gvMask.center_of_mass is the mean voxel *index*, in (z, y, x) array order —
        # convert to absolute patient-space mm, (x, y, z), matching scan.origin/anchor
        zi, yi, xi = gvMask.center_of_mass.cpu().numpy().tolist()
        centerOfMass = (oX + xi * sX, oY + yi * sY, oZ + zi * sZ)

        contour = Contour(
            name=name,
            number=number,
            color=color,
            mask=gvMask,
            center_of_mass=centerOfMass,
            mesh=Mesh.fromArr(mask, scan),
        )
        contours[contour.id] = contour

    return contours
