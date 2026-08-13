import * as THREE from 'three'
import { Axis, ResponseSlice, Scan, Vec3D } from '../types'
import { toWorld } from './coords'

const loader = new THREE.TextureLoader()

const AXIS_DU: { [key in Axis]: Vec3D } = { axial: [1, 0, 0], coronal: [1, 0, 0], sagittal: [0, 1, 0] }
const AXIS_DV: { [key in Axis]: Vec3D } = { axial: [0, -1, 0], coronal: [0, 0, -1], sagittal: [0, 0, -1] }

// mirrors backend/app/models/image.py::orthogonal() geometry, without clamping idx to
// the scan's valid range so out-of-range slices can still be positioned/rendered as blanks
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

const planeBasis = (dU: Vec3D, dV: Vec3D) => {
    const u = new THREE.Vector3(...toWorld(dU)).normalize()
    const v = new THREE.Vector3(...toWorld(dV)).normalize()
    const normal = new THREE.Vector3().crossVectors(u, v).normalize()
    return { u, v, normal }
}

const orientPlane = (mesh: THREE.Mesh, slice: Omit<ResponseSlice, 'url'>) => {
    const { u, v, normal } = planeBasis(slice.dU, slice.dV)

    mesh.setRotationFromMatrix(new THREE.Matrix4().makeBasis(u, v, normal))
    const c = toWorld(slice.center)
    mesh.position.set(c[0], c[1], c[2])
}

// world-space direction facing the (non-mirrored) front of the given axis's slice plane,
// plus the "up" direction (the plane's own local V axis) to keep it upright — used to snap
// the camera to a flat, face-on view of the current slice (see SceneManager.setOrthogonalView)
export const axisFrame = (ax: Axis): { normal: THREE.Vector3, up: THREE.Vector3 } => {
    const { v, normal } = planeBasis(AXIS_DU[ax], AXIS_DV[ax])

    // coronal/sagittal's raw plane basis has "up" pointing Inferior, not Superior. Viewing
    // from the opposite side (-normal) with up flipped too (-v) reads as a 180° rotation
    // about the horizontal (u) axis: Superior ends up on top and left/right is unaffected,
    // since screen-right stays === u either way (axial isn't affected — its up axis is AP,
    // not SI, so there's nothing to flip there).
    if (ax === 'coronal' || ax === 'sagittal')
        return { normal: normal.multiplyScalar(-1), up: v.multiplyScalar(-1) }
    return { normal, up: v }
}

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

// placeholder plane for slice indices outside the scan's valid range
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

export const dispose = (mesh: THREE.Mesh) => {
    mesh.geometry.dispose()
    const mat = mesh.material as THREE.MeshBasicMaterial
    mat.map?.dispose()
    mat.dispose()
}
