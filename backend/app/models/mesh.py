from dataclasses import dataclass

import numpy as np
from skimage.measure import marching_cubes


@dataclass
class Mesh:
    vertices: np.ndarray
    faces: np.ndarray

    @staticmethod
    def fromArr(arr, scan):
        if arr.sum() < 8:
            return None

        fill = float(arr.min()) if arr.dtype != bool else 0.0
        pad = np.pad(arr.astype(np.float32), 1, mode="constant", constant_values=fill)

        try:
            verts, faces, _, _ = marching_cubes(pad, level=0.5, spacing=scan.spacing)
        except Exception:
            return None

        if verts.shape[0] == 0 or faces.shape[0] == 0:
            return None

        verts = verts - np.array(scan.spacing)
        oX, oY, oZ = scan.origin
        mm = np.empty_like(verts)
        mm[:, 0] = oX + verts[:, 2]
        mm[:, 1] = oY + verts[:, 1]
        mm[:, 2] = oZ + verts[:, 0]

        return Mesh(vertices=mm.astype(np.float32), faces=faces.astype(np.int32))

    def json(self):
        return {
            "vertices": self.vertices.astype(np.float32).flatten().tolist(),
            "faces": self.faces.astype(np.int32).flatten().tolist(),
            "vertex_count": int(self.vertices.shape[0]),
            "face_count": int(self.faces.shape[0]),
        }
