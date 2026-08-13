import { Vec3D } from '../types'


export const toWorld = (v: Vec3D): Vec3D => [v[0], v[2], -v[1]]