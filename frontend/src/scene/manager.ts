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
    // unit vector from target to camera; orbiting rotates this (and cameraUp) about an
    // arbitrary axis (see rotateCamera) instead of being restricted to yaw/pitch about the
    // world Y/X axes
    private cameraOffset = new THREE.Vector3(
        Math.cos(Math.PI / 6) * Math.sin(Math.PI / 4),
        Math.sin(Math.PI / 6),
        Math.cos(Math.PI / 6) * Math.cos(Math.PI / 4),
    ).normalize()
    // rotated in lockstep with cameraOffset so the camera doesn't roll/flip when orbiting
    // about axes other than world Y (lookAt() alone assumes a fixed up and only behaves
    // predictably for rotation about that same axis)
    private cameraUp = new THREE.Vector3(0, 1, 0)

    // snapshot of the camera's state as originally framed — restored by resetCamera()
    // (target/distance are re-captured each time a dataset is freshly framed via setCamera;
    // offset/up are the fixed initial viewing angle and never change after construction)
    private defaultTarget = this.cameraTarget.clone()
    private defaultDistance = this.cameraDistance
    private defaultOffset = this.cameraOffset.clone()
    private defaultUp = this.cameraUp.clone()

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

        ;['A', 'B'].forEach(slot => {this.dataset[slot] = this.makeDataset(slot)})
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
        Object.values(this.dataset).forEach((d) => {
            disposeObj(d.outer)
            if (d.axes)
                disposeObj(d.axes)
        })
        this.renderer.dispose()
        this.renderer.domElement.remove()
    }
    
    // --- CAMERA
    setCamera(center: Vec3D, radius: number) {
        const c = toWorld(center)
        this.cameraTarget.set(c[0], c[1], c[2])
        this.cameraDistance = THREE.MathUtils.clamp(radius * 2.6, 50, 5000)

        this.defaultTarget.copy(this.cameraTarget)
        this.defaultDistance = this.cameraDistance

        this.updateCamera()
    }

    private updateCamera() {
        const pos = this.cameraTarget.clone().addScaledVector(this.cameraOffset, this.cameraDistance)
        this.camera.position.copy(pos)
        this.camera.up.copy(this.cameraUp)
        this.camera.lookAt(this.cameraTarget)
    }

    // ctrl/cmd + scroll: sign < 0 (scroll up) zooms in, sign > 0 (scroll down) zooms out
    zoomCamera(sign: number) {
        const factor = sign > 0 ? 1.1 : 1 / 1.1
        this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance * factor, 20, 10000)
        this.updateCamera()
    }

    // space + scroll: orbit the camera about `axis` (a patient-space direction, e.g. the
    // current slice's normal). `angle` is a right-hand-rule rotation about `axis`: viewed
    // from the tip of `axis` looking back at the target (i.e. looking into the screen along
    // -axis, matching how the corresponding slice is actually viewed), a negative angle
    // reads as clockwise and a positive angle as anticlockwise.
    rotateCamera(axis: Vec3D, angle: number) {
        const worldAxis = new THREE.Vector3(...toWorld(axis)).normalize()
        this.cameraOffset.applyAxisAngle(worldAxis, angle)
        this.cameraUp.applyAxisAngle(worldAxis, angle)
        this.updateCamera()
    }

    // enter key: snap the camera to look straight down `normal` (world-space, pointing from
    // the slice plane toward the camera, i.e. the viewing direction ends up perpendicular to
    // the plane) with `up` as the screen's vertical — a flat, face-on 2D view of the slice.
    // Distance is left untouched so the current zoom level is preserved.
    setOrthogonalView(normal: THREE.Vector3, up: THREE.Vector3) {
        this.cameraOffset.copy(normal).normalize()
        this.cameraUp.copy(up).normalize()
        this.updateCamera()
    }

    // 'o' key: restore the camera to how it was framed when the dataset first loaded,
    // undoing any zoom/orbit made since.
    resetCamera() {
        this.cameraTarget.copy(this.defaultTarget)
        this.cameraDistance = this.defaultDistance
        this.cameraOffset.copy(this.defaultOffset)
        this.cameraUp.copy(this.defaultUp)
        this.updateCamera()
    }

    // --- AXES
    // Cross centered on (0, 0, 0) — each line spans the dataset's full extent along its
    // own axis, meeting at world origin (where the scan's own center sits right after
    // load, before any anchor edit — see setDatasetTrans).
    private makeAxes(extent: Vec3D): THREE.LineSegments {
        const [eX, eY, eZ] = toWorld(extent)

        const shX = eX / 2
        const shY = eY / 2
        const shZ = eZ / 2

        const positions = new Float32Array([
            -shX, 0, 0,   shX, 0, 0,   // X axis
            0, -shY, 0,   0, shY, 0,   // Y axis
            0, 0, -shZ,   0, 0, shZ,   // Z axis
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

    // Axes are anchored to world origin and live directly on the scene, outside the
    // per-slot inner/outer transform chain, so they never move when a dataset's anchor
    // (or alignment offset) changes — only the scan content should translate.
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

    // --- ACTIVE SLOT
    private activeSlot = 'A'

    setActiveSlot(slot: string) {
        this.activeSlot = slot
        Object.entries(this.dataset).forEach(([s, d]) => {
            d.outer.visible = s === slot
            if (d.axes)
                d.axes.visible = s === slot
        })
    }

    // ctrl+tab: show both slots' content together (so both sets of contours render at once),
    // with each slot's scan slice hidden first — a pure view-layer override, contour
    // visibility and dataset.scan.visible are left untouched. Exiting just falls back to the
    // normal single-slot display via setActiveSlot('A').
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

    // --- DATASET
    private makeDataset(slot: string): VisDataset {
        const inner = new THREE.Group()
        const outer = new THREE.Group()
        outer.visible = slot === this.activeSlot

        outer.add(inner)
        this.scene.add(outer)

        return { inner, outer, 'anchor':[0, 0, 0], 'outs': {}, 'slices': {}, 'axes': null }
    }

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

    // Content is shifted by -anchor so the anchor point sits at the outer group's local
    // origin (this is also what lets `rotation` pivot around the anchor rather than world
    // origin), then the whole group is placed at `offset` in world space. The anchor's
    // own world position is intentionally NOT re-added here — that's what makes the scan
    // translate as the anchor changes, while the (scene-level, always-origin) axes stay put.
    setDatasetTrans(slot: string, anchor: Vec3D, offset: Vec3D, rotation: Vec3D) {
        const d = this.dataset[slot]
        const a = toWorld(anchor)
        const o = toWorld(offset)

        d.anchor = a
        d.inner.position.set(-a[0], -a[1], -a[2])
        d.outer.position.set(o[0], o[1], o[2])
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

    setScanVisibility(slot: string, visible: boolean) {
        const d = this.dataset[slot]
        Object.values(d.slices).forEach(obj => { obj.visible = visible })
    }

    // --- CONTOUR / SURFACE
    renderContour(
        slot: string,
        id: string,
        mesh: ResponseMesh,
        color: [number, number, number],
        opacity: number,
        visible: boolean,
        partial: boolean,
    ) {
        const d = this.dataset[slot]
        this.removeContour(slot, id)

        const renderer = partial ? renderPartial : renderFull
        const obj = renderer(mesh, color, opacity)
        obj.visible = visible
        d.inner.add(obj)
        d.outs[id] = obj
    }

    removeContour(slot: string, id: string) {
        const d = this.dataset[slot]
        const obj = d.outs[id]
        if (!d || !obj)
            return
        d.inner.remove(obj)
        disposeObj(obj)
        delete d.outs[id]
    }

    rendered(slot: string, id: string) {
        return id in this.dataset[slot].outs
    }

    setContourVisibility(slot: string, id: string, visible: boolean) {
        const obj = this.dataset[slot].outs[id]
        if (obj)
            obj.visible = visible
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