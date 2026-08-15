import * as THREE from 'three'
import { ResponseMesh, Vec3D, VisDataset } from '../types'
import { toWorld } from './coords'
import { renderFull, renderPartial } from './mesh'

export default class SceneManager {
    private container
    private scene

    private camera
    private cameraTarget = new THREE.Vector3(0, 0, 0)
    private cameraDistance = 400
    private cameraOffset = new THREE.Vector3(
        Math.cos(Math.PI / 6) * Math.sin(Math.PI / 4),
        Math.sin(Math.PI / 6),
        Math.cos(Math.PI / 6) * Math.cos(Math.PI / 4),
    ).normalize()
    private cameraUp = new THREE.Vector3(0, 1, 0)

    private defaultTarget = this.cameraTarget.clone()
    private defaultDistance = this.cameraDistance
    private defaultOffset = this.cameraOffset.clone()
    private defaultUp = this.cameraUp.clone()

    private renderer
    private resizeObserver

    private frameHandle = 0

    private arbitraryAxis: THREE.Line | null = null

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

        ;['A', 'B'].forEach(slot => {this.dataset[slot] = this.makeDataset(slot)})
    }

    /** Resizes the renderer and camera aspect to match the container's current size. */
    resize() {
        const w = this.container.clientWidth || 1
        const h = this.container.clientHeight || 1
        this.camera.aspect = w / h
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(w, h, false)
    }

    /** Renders one animation frame and schedules the next. */
    private animate() {
        this.frameHandle = requestAnimationFrame(this.animate)
        this.renderer.render(this.scene, this.camera)
    }

    /** Tears down the renderer, observers, and all scene content. */
    dispose() {
        cancelAnimationFrame(this.frameHandle)
        this.resizeObserver.disconnect()
        Object.values(this.dataset).forEach((d) => {
            disposeObj(d.outer)
            if (d.axes)
                disposeObj(d.axes)
        })
        if (this.arbitraryAxis)
            disposeObj(this.arbitraryAxis)
        this.renderer.dispose()
        this.renderer.domElement.remove()
    }

    /** Frames the camera on a newly-loaded dataset and records this as the camera's reset state. */
    setCamera(center: Vec3D, radius: number) {
        const c = toWorld(center)
        this.cameraTarget.set(c[0], c[1], c[2])
        this.cameraDistance = THREE.MathUtils.clamp(radius * 2.6, 50, 5000)

        this.defaultTarget.copy(this.cameraTarget)
        this.defaultDistance = this.cameraDistance

        this.updateCamera()
    }

    /** Applies the current target/offset/distance/up state to the camera object. */
    private updateCamera() {
        const pos = this.cameraTarget.clone().addScaledVector(this.cameraOffset, this.cameraDistance)
        this.camera.position.copy(pos)
        this.camera.up.copy(this.cameraUp)
        this.camera.lookAt(this.cameraTarget)
    }

    /** Zooms the camera in (sign < 0) or out (sign > 0) by a fixed step. */
    zoomCamera(sign: number) {
        const factor = sign > 0 ? 1.1 : 1 / 1.1
        this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance * factor, 20, 10000)
        this.updateCamera()
    }

    /** Orbits the camera by `angle` about `axis` (a patient-space direction), keeping cameraUp in lockstep to avoid roll. */
    rotateCamera(axis: Vec3D, angle: number) {
        const worldAxis = new THREE.Vector3(...toWorld(axis)).normalize()
        this.cameraOffset.applyAxisAngle(worldAxis, angle)
        this.cameraUp.applyAxisAngle(worldAxis, angle)
        this.updateCamera()
    }

    /** Snaps the camera to a flat, face-on view along `normal` with `up` as the screen vertical, preserving zoom distance. */
    setOrthogonalView(normal: THREE.Vector3, up: THREE.Vector3) {
        this.cameraOffset.copy(normal).normalize()
        this.cameraUp.copy(up).normalize()
        this.updateCamera()
    }

    /** Restores the camera to the state captured by the most recent `setCamera` call. */
    resetCamera() {
        this.cameraTarget.copy(this.defaultTarget)
        this.cameraDistance = this.defaultDistance
        this.cameraOffset.copy(this.defaultOffset)
        this.cameraUp.copy(this.defaultUp)
        this.updateCamera()
    }

    /** Builds a world-origin-centered RGB cross spanning `extent` along each patient-space axis. */
    private makeAxes(extent: Vec3D): THREE.LineSegments {
        const [eX, eY, eZ] = toWorld(extent)

        const shX = eX / 2
        const shY = eY / 2
        const shZ = eZ / 2

        const positions = new Float32Array([
            -shX, 0, 0,   shX, 0, 0,
            0, -shY, 0,   0, shY, 0,
            0, 0, -shZ,   0, 0, shZ,
        ])

        const colors = new Float32Array([
            1, 0, 0,  1, 0, 0,
            0, 1, 0,  0, 1, 0,
            0, 0, 1,  0, 0, 1,
        ])

        const geom = new THREE.BufferGeometry()
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))

        const mat = new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false })
        return new THREE.LineSegments(geom, mat)
    }

    /** (Re)builds a slot's fixed, world-origin-anchored axes cross, visible only when that slot is active. */
    setAxes(slot: string, extent: Vec3D) {
        const d = this.dataset[slot]
        if (d.axes) {
            this.scene.remove(d.axes)
            disposeObj(d.axes)
        }
        d.axes = this.makeAxes(extent)
        d.axes.visible = slot === this.activeSlot
        this.scene.add(d.axes)
    }

    /** Draws the global arbitrary-axis marker line through world origin along `normal`. */
    setArbitraryAxis(normal: Vec3D, extent: number) {
        this.clearArbitraryAxis()

        const n = new THREE.Vector3(...toWorld(normal)).normalize()
        const half = extent / 2

        const geom = new THREE.BufferGeometry()
        geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
            -n.x * half, -n.y * half, -n.z * half,
            n.x * half, n.y * half, n.z * half,
        ]), 3))

        const mat = new THREE.LineBasicMaterial({ color: 0xffffff, toneMapped: false })
        this.arbitraryAxis = new THREE.Line(geom, mat)
        this.scene.add(this.arbitraryAxis)
    }

    /** Removes and disposes the arbitrary-axis marker line, if present. */
    clearArbitraryAxis() {
        if (this.arbitraryAxis) {
            this.scene.remove(this.arbitraryAxis)
            disposeObj(this.arbitraryAxis)
            this.arbitraryAxis = null
        }
    }

    private activeSlot = 'A'

    /** Sets which slot's content (and axes) is visible. */
    setActiveSlot(slot: string) {
        this.activeSlot = slot
        Object.entries(this.dataset).forEach(([s, d]) => {
            d.outer.visible = s === slot
            if (d.axes)
                d.axes.visible = s === slot
        })
    }

    /** Enables/disables dual mode: shows both slots' content at once with scans force-hidden, or falls back to slot A when disabled. */
    setDualMode(active: boolean) {
        if (!active) {
            this.setActiveSlot('A')
            return
        }

        Object.keys(this.dataset).forEach(slot => {
            this.dataset[slot].outer.visible = true
            this.setScanVisibility(slot, false)
        })
    }

    /** Builds a fresh, empty inner/outer group pair for a slot. */
    private makeDataset(slot: string): VisDataset {
        const inner = new THREE.Group()
        const outer = new THREE.Group()
        outer.visible = slot === this.activeSlot

        outer.add(inner)
        this.scene.add(outer)

        return { inner, outer, 'anchor':[0, 0, 0], 'outs': {}, 'slices': {}, 'overlays': {}, 'axes': null }
    }

    /** Disposes and resets a slot's entire scene content back to an empty state. */
    removeDataset(slot: string) {
        const d = this.dataset[slot]
        disposeObj(d.outer)
        this.scene.remove(d.outer)
        if (d.axes) {
            this.scene.remove(d.axes)
            disposeObj(d.axes)
        }
        this.dataset[slot] = this.makeDataset(slot)
    }

    /** Positions a slot's content so `anchor` sits at world origin, then offsets by `offset`; `rotation` is not yet wired up. */
    setDatasetTrans(slot: string, anchor: Vec3D, offset: Vec3D, rotation: Vec3D) {
        const d = this.dataset[slot]
        const a = toWorld(anchor)
        const o = toWorld(offset)

        d.anchor = a
        d.inner.position.set(-a[0], -a[1], -a[2])
        d.outer.position.set(o[0], o[1], o[2])
        d.outer.rotation.set(rotation[0], rotation[1], rotation[2], 'XYZ')
    }

    /** Replaces (or clears) the scan slice plane rendered under `key` for a slot. */
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

    /** Removes and disposes every slice plane for a slot. */
    clearSlice(slot: string) {
        const d = this.dataset[slot]
        Object.values(d.slices).forEach(p => {
            d.inner.remove(p)
            disposeObj(p)
        })
        d.slices = {}
    }

    /** Sets visibility of all of a slot's scan slice planes. */
    setScanVisibility(slot: string, visible: boolean) {
        const d = this.dataset[slot]
        Object.values(d.slices).forEach(obj => { obj.visible = visible })
    }

    /** Replaces (or clears) the contour slice-overlay plane rendered under `key` for a slot. */
    setOverlay(slot: string, key: string, obj: THREE.Object3D | null) {
        const d = this.dataset[slot]
        if (key in d.overlays) {
            d.inner.remove(d.overlays[key])
            disposeObj(d.overlays[key])
            delete d.overlays[key]
        }
        if (obj) {
            d.inner.add(obj)
            d.overlays[key] = obj
        }
    }

    /** Removes and disposes every overlay plane for a slot. */
    clearOverlays(slot: string) {
        const d = this.dataset[slot]
        Object.values(d.overlays).forEach(p => {
            d.inner.remove(p)
            disposeObj(p)
        })
        d.overlays = {}
    }

    /** Removes only the overlay planes whose key is not in `keepKeys`, leaving the rest untouched. */
    pruneOverlays(slot: string, keepKeys: Set<string>) {
        const d = this.dataset[slot]
        Object.keys(d.overlays).forEach(key => {
            if (!keepKeys.has(key))
                this.setOverlay(slot, key, null)
        })
    }

    /** Replaces a contour's rendered 3D mesh with a freshly-built one. */
    renderContour(
        slot: string,
        id: string,
        mesh: ResponseMesh,
        color: [number, number, number],
        opacity: number,
        visible: boolean,
        partial: boolean,
        vertexColors?: number[],
    ) {
        const d = this.dataset[slot]
        this.removeContour(slot, id)

        const renderer = partial ? renderPartial : renderFull
        const obj = renderer(mesh, color, opacity, vertexColors)
        obj.visible = visible
        d.inner.add(obj)
        d.outs[id] = obj
    }

    /** Removes and disposes a contour's rendered mesh, if present. */
    removeContour(slot: string, id: string) {
        const d = this.dataset[slot]
        const obj = d.outs[id]
        if (!d || !obj)
            return
        d.inner.remove(obj)
        disposeObj(obj)
        delete d.outs[id]
    }

    /** Returns whether a contour currently has a rendered mesh in a slot. */
    rendered(slot: string, id: string) {
        return id in this.dataset[slot].outs
    }

    /** Sets visibility of a contour's rendered mesh, if present. */
    setContourVisibility(slot: string, id: string, visible: boolean) {
        const obj = this.dataset[slot].outs[id]
        if (obj)
            obj.visible = visible
    }
}


/** Recursively disposes a Three.js object's geometry and material(s). */
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
