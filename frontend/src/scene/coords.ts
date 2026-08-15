import { Vec3D } from '../types'


/** Remaps a DICOM patient-space coordinate into Three.js world space. */
export const toWorld = (v: Vec3D): Vec3D => [v[0], v[2], -v[1]]
