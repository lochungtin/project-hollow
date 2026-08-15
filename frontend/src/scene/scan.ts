import * as THREE from 'three'
import { Axis, ResponseSlice, Scan, Vec3D } from '../types'
import { toWorld } from './coords'

const loader = new THREE.TextureLoader()

const AXIS_DU: { [key in Axis]: Vec3D } = { axial: [1, 0, 0], coronal: [1, 0, 0], sagittal: [0, 1, 0] }
const AXIS_DV: { [key in Axis]: Vec3D } = { axial: [0, -1, 0], coronal: [0, 0, -1], sagittal: [0, 0, -1] }

/** Computes a cardinal-axis slice's plane geometry (center/basis/extent), without clamping `idx` to the scan's valid range. */
export const sliceGeometry = (scan: Scan, ax: Axis, idx: number): Omit<ResponseSlice, 'url'> => {
    const [, y, x] = scan.shape
    const [sZ, sY, sX] = scan.spacing
    const [oX, oY, oZ] = scan.origin

    const shX = (x - 1) * sX
    const shY = (y - 1) * sY
    const shZ = (scan.shape[0] - 1) * sZ

    const dims: { [key in Axis]: [number, number] } = {
        axial: [shX, shY],
        coronal: [shX, shZ],
        sagittal: [shY, shZ],
    }

    const cX = oX + shX / 2
    const cY = oY + shY / 2
    const cZ = oZ + shZ / 2

    const center: { [key in Axis]: Vec3D } = {
        axial: [cX, cY, oZ + idx * sZ],
        coronal: [cX, oY + idx * sY, cZ],
        sagittal: [oX + idx * sX, cY, cZ],
    }

    return {
        center: center[ax],
        dU: AXIS_DU[ax],
        dV: AXIS_DV[ax],
        width: dims[ax][0],
        height: dims[ax][1],
    }
}

/** Computes the arbitrary-axis slicing grid's pixel/index bound, sized to the volume's bounding-box diagonal so it covers the whole scan at any orientation. */
const arbitraryDim = (scan: Scan): { dim: number, spacing: number } => {
    const [z, y, x] = scan.shape
    const [sZ, sY, sX] = scan.spacing
    const spacing = sX

    const shX = (x - 1) * sX
    const shY = (y - 1) * sY
    const shZ = (z - 1) * sZ
    const diag = Math.sqrt(shX ** 2 + shY ** 2 + shZ ** 2)

    return { dim: Math.max(2, Math.round(diag / spacing)), spacing }
}

/** Returns the maximum (symmetric) arbitrary-axis slice index for a scan, used as the scroll bound. */
export const arbitraryMaxIdx = (scan: Scan): number => Math.floor(arbitraryDim(scan).dim / 2)

/** Computes a freeform-plane slice's geometry through `anchor` along `normal`, without clamping `idx` to the scan's valid range. */
export const arbitrarySliceGeometry = (scan: Scan, anchor: Vec3D, normal: Vec3D, idx: number): Omit<ResponseSlice, 'url'> => {
    const nRaw = new THREE.Vector3(...normal)
    const n = nRaw.lengthSq() > 1e-18 ? nRaw.clone().normalize() : new THREE.Vector3(0, 0, 1)

    const ref = Math.abs(n.z) > 0.9 ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(0, 0, -1)
    const v = ref.clone().sub(n.clone().multiplyScalar(ref.dot(n))).normalize()
    const u = new THREE.Vector3().crossVectors(v, n)

    const { dim, spacing } = arbitraryDim(scan)
    const center = new THREE.Vector3(...anchor).addScaledVector(n, idx * spacing)
    const extent = dim * spacing

    return {
        center: [center.x, center.y, center.z],
        dU: [u.x, u.y, u.z],
        dV: [v.x, v.y, v.z],
        width: extent,
        height: extent,
    }
}

/** Derives a plane mesh's world-space basis (u/v/normal) from a slice's patient-space dU/dV directions. */
const planeBasis = (dU: Vec3D, dV: Vec3D) => {
    const u = new THREE.Vector3(...toWorld(dU)).normalize()
    const v = new THREE.Vector3(...toWorld(dV)).normalize()
    const normal = new THREE.Vector3().crossVectors(u, v).normalize()
    return { u, v, normal }
}

/** Positions and orients a plane mesh to match a slice's geometry. */
const orientPlane = (mesh: THREE.Mesh, slice: Omit<ResponseSlice, 'url'>) => {
    const { u, v, normal } = planeBasis(slice.dU, slice.dV)

    mesh.setRotationFromMatrix(new THREE.Matrix4().makeBasis(u, v, normal))
    const c = toWorld(slice.center)
    mesh.position.set(c[0], c[1], c[2])
}

/**
 * Returns the world-space viewing normal and up vector for a flat, face-on view of a
 * cardinal axis's slice plane (Enter key). Axial flips only the pole (normal), trading
 * left/right basis consistency for keeping Anterior on top; coronal/sagittal flip both
 * normal and up to keep Superior on top with consistent left/right.
 */
export const axisFrame = (ax: Axis): { normal: THREE.Vector3, up: THREE.Vector3 } => {
    const { v, normal } = planeBasis(AXIS_DU[ax], AXIS_DV[ax])
    const flippedNormal = normal.multiplyScalar(-1)

    if (ax === 'axial')
        return { normal: flippedNormal, up: v }

    return { normal: flippedNormal, up: v.multiplyScalar(-1) }
}

/** Loads a scan slice's texture and builds its opaque plane mesh. */
export const render = (slice: ResponseSlice): Promise<THREE.Mesh> => new Promise((res, rej) => {
    loader.load(
        slice.url,
        (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace
            texture.minFilter = THREE.LinearFilter
            texture.magFilter = THREE.LinearFilter
            texture.generateMipmaps = false

            const geom = new THREE.PlaneGeometry(Math.max(slice.width, 0.01), Math.max(slice.height, 0.01))
            const mat = new THREE.MeshBasicMaterial({
                map: texture,
                side: THREE.DoubleSide,
                transparent: false,
                toneMapped: false,
            })

            const mesh = new THREE.Mesh(geom, mat)
            orientPlane(mesh, slice)
            res(mesh)
        },
        undefined,
        rej
    )})

/** Loads a contour slice-overlay's RGBA texture and builds its transparent, depth-write-off plane mesh. */
export const renderOverlay = (slice: ResponseSlice): Promise<THREE.Mesh> => new Promise((res, rej) => {
    loader.load(
        slice.url,
        (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace
            texture.minFilter = THREE.LinearFilter
            texture.magFilter = THREE.LinearFilter
            texture.generateMipmaps = false

            const geom = new THREE.PlaneGeometry(Math.max(slice.width, 0.01), Math.max(slice.height, 0.01))
            const mat = new THREE.MeshBasicMaterial({
                map: texture,
                side: THREE.DoubleSide,
                transparent: true,
                depthWrite: false,
                toneMapped: false,
            })

            const mesh = new THREE.Mesh(geom, mat)
            orientPlane(mesh, slice)
            res(mesh)
        },
        undefined,
        rej
    )})

/** Builds a black placeholder plane for a slice index outside the scan's valid range. */
export const renderBlack = (slice: Omit<ResponseSlice, 'url'>): THREE.Mesh => {
    const geom = new THREE.PlaneGeometry(Math.max(slice.width, 0.01), Math.max(slice.height, 0.01))
    const mat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.DoubleSide,
        toneMapped: false,
    })

    const mesh = new THREE.Mesh(geom, mat)
    orientPlane(mesh, slice)
    return mesh
}

/** Disposes a slice plane mesh's geometry, texture, and material. */
export const dispose = (mesh: THREE.Mesh) => {
    mesh.geometry.dispose()
    const mat = mesh.material as THREE.MeshBasicMaterial
    mat.map?.dispose()
    mat.dispose()
}
