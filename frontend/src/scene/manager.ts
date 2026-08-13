import * as THREE from 'three'
import { Vec3D, VisDataset } from '../types'
import { toWorld } from './coords'

export default class SceneManager {
    private container
    private scene

    private camera
    private cameraTarget = new THREE.Vector3(0, 0, 0)
    private cameraDistance = 400
    private cameraYaw = Math.PI / 4
    private cameraPitch = Math.PI / 6

    private renderer
    private resizeObserver

    private frameHandle = 0

    private dataset: { [key: string]: VisDataset } = {}

    constructor(container: HTMLElement) {
        this.container = container

        this.scene = new THREE.Scene()
        this.scene.background = new THREE.Color(0x111111)

        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100000)
        this.updateCamera()

        this.renderer = new THREE.WebGLRenderer({ antialias: true })
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        container.appendChild(this.renderer.domElement)

        const hemi = new THREE.HemisphereLight(0xffffff, 0x1a1c22, 1.1)
        this.scene.add(hemi)

        const dir = new THREE.DirectionalLight(0xffffff, 0.9)
        dir.position.set(1, 1.4, 1)
        this.scene.add(dir)

        const dir2 = new THREE.DirectionalLight(0xffffff, 0.35)
        dir2.position.set(-1, -0.6, -0.8)
        this.scene.add(dir2)

        this.resizeObserver = new ResizeObserver(() => this.resize())
        this.resizeObserver.observe(container)
        this.resize()

        this.animate = this.animate.bind(this)
        this.frameHandle = requestAnimationFrame(this.animate)

        ;['A', 'B'].forEach(slot => {this.dataset[slot] = this.makeDataset()})
    }

    resize() {
        const w = this.container.clientWidth || 1
        const h = this.container.clientHeight || 1
        this.camera.aspect = w / h
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(w, h, false)
    }

    private animate() {
        this.frameHandle = requestAnimationFrame(this.animate)
        this.renderer.render(this.scene, this.camera)
    }

    dispose() {
        cancelAnimationFrame(this.frameHandle)
        this.resizeObserver.disconnect()
        Object.values(this.dataset).forEach((d) => disposeObj(d.outer))
        this.renderer.dispose()
        this.renderer.domElement.remove()
    }
    
    // --- CAMERA
    setCamera(center: Vec3D, radius: number) {
        const c = toWorld(center)
        this.cameraTarget.set(c[0], c[1], c[2])
        this.cameraDistance = THREE.MathUtils.clamp(radius * 2.6, 50, 5000)
        this.updateCamera()
    }

    private updateCamera() {
        const x = this.cameraTarget.x + this.cameraDistance * Math.cos(this.cameraPitch) * Math.sin(this.cameraYaw)
        const y = this.cameraTarget.y + this.cameraDistance * Math.sin(this.cameraPitch)
        const z = this.cameraTarget.z + this.cameraDistance * Math.cos(this.cameraPitch) * Math.cos(this.cameraYaw)
        this.camera.position.set(x, y, z)
        this.camera.lookAt(this.cameraTarget)
    }

    // --- AXES
    private makeAxes(origin: Vec3D, extent: Vec3D): THREE.LineSegments {
        const [oX, oY, oZ] = toWorld(origin)
        const [eX, eY, eZ] = toWorld(extent)

        const shX = eX / 2
        const shY = eY/ 2
        const shZ = eZ / 2

        const positions = new Float32Array([
            oX, oY + shY, oZ + shZ,   oX + eX, oY + shY, oZ + shZ,   // X axis
            oX + shX, oY, oZ + shZ,   oX + shX, oY + eY, oZ + shZ,   // Y axis
            oX + shX, oY + shY, oZ,   oX + shX, oY + shY, oZ + eZ,   // Z axis
        ])

        const colors = new Float32Array([
            1, 0, 0,  1, 0, 0,   // red
            0, 1, 0,  0, 1, 0,   // green
            0, 0, 1,  0, 0, 1,   // blue
        ])

        const geom = new THREE.BufferGeometry()
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))

        const mat = new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false })
        return new THREE.LineSegments(geom, mat)
    }

    setAxes(slot: string, origin: Vec3D, extent: Vec3D) {
        const d = this.dataset[slot]
        if (d.axes) {
            d.inner.remove(d.axes)
            disposeObj(d.axes)
        }
        d.axes = this.makeAxes(origin, extent)
        d.inner.add(d.axes)
    }

    // --- DATASET
    private makeDataset(): VisDataset {
        const inner = new THREE.Group()
        const outer = new THREE.Group()

        outer.add(inner)
        this.scene.add(outer)

        return { inner, outer, 'anchor':[0, 0, 0], 'outs': {}, 'slices': {}, 'axes': null }
    }

    removeDataset(slot: string) {
        const d = this.dataset[slot]
        disposeObj(d.outer)
        this.scene.remove(d.outer)
        this.dataset[slot] = this.makeDataset()
    }

    setDatasetTrans(slot: string, anchor: Vec3D, offset: Vec3D, rotation: Vec3D) {
        const d = this.dataset[slot]
        const a = toWorld(anchor)
        const o = toWorld(offset)

        d.anchor = a
        d.inner.position.set(-a[0], -a[1], -a[2])
        d.outer.position.set(a[0] + o[0], a[1] + o[1], a[2] + o[2])
        // NOTE: rotation is still an inert passthrough (not wired up yet).
        // Euler angles can't be remapped by the same per-component swap as a
        // position — they'll need proper conjugation by this rotation once
        // alignment/rotation is actually implemented.
        d.outer.rotation.set(rotation[0], rotation[1], rotation[2], 'XYZ')
    }

    // --- PLANE SLICING
    setSlice(slot: string, key: string, slice: THREE.Object3D | null) {
        const d = this.dataset[slot]
        if (key in d.slices) {
            d.inner.remove(d.slices[key])
            disposeObj(d.slices[key])
            delete d.slices[key]
        }
        if (slice) {
            d.inner.add(slice)
            d.slices[key] = slice
            console.log('set slice')
        }
    }

    clearSlice(slot: string) {
        const d = this.dataset[slot]
        Object.values(d.slices).forEach(p => {
            d.inner.remove(p)
            disposeObj(p)
        })
        d.slices = {}
    }
}

const disposeObj = (obj: THREE.Object3D) => {
    obj.traverse((child) => {
        const c = child as unknown as { geometry?: THREE.BufferGeometry, material?: THREE.Material | THREE.Material[] }
        c.geometry?.dispose()
        if (Array.isArray(c.material))
            c.material.forEach(m => m.dispose())
        else
            c.material?.dispose()
    })
}