from io import BytesIO

import numpy as np
import pydicom
from scipy.ndimage import zoom as ndi_zoom

from .models.scan import Scan


def _byteToSlices(filesBytes):
    rt = []
    for b in filesBytes:
        try:
            rt.append(pydicom.dcmread(BytesIO(b), force=True))
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
        rt.append({"data": d, "normal": float(np.dot(ipp, norm))})

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

    return np.asarray([sZ, float(spacing[0]), float(spacing[1])], float)


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

    return Scan(
        array=_resample(volume, spacing).astype(np.float32),
        spacing=spacing,
        modality=str(getattr(first, "Modality", "UNKNOWN")),
    )
