import * as THREE from 'three'
import { ResponseSlice } from '../types'
import { toWorld } from './coords'

const loader = new THREE.TextureLoader()

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

            const u = new THREE.Vector3(...slice.dU).normalize()
            const v = new THREE.Vector3(...slice.dV).normalize()
            const normal = new THREE.Vector3().crossVectors(u, v).normalize()

            mesh.setRotationFromMatrix(new THREE.Matrix4().makeBasis(u, v, normal))
            const c = toWorld(slice.center)
            mesh.position.set(c[0], c[1], c[2])
            res(mesh)
        },
        undefined,
        rej
    )})

export const dispose = (mesh: THREE.Mesh) => {
    mesh.geometry.dispose()
    const mat = mesh.material as THREE.MeshBasicMaterial
    mat.map?.dispose()
    mat.dispose()
}