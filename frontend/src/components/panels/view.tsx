import { useEffect, useRef } from 'react'
import { getArbitrarySlice, getContour, getOrthogonal } from '../../api/client'
import SceneManager from '../../scene/manager'
import { arbitraryMaxIdx, arbitrarySliceGeometry, axisFrame, render, renderBlack, sliceGeometry } from '../../scene/scan'
import { useAppState } from '../../state'
import { Axis, Scan, SliceState, Vec3D } from '../../types'
import './view.css'


const AXIS_NUM_MAP: { [key: string]: Axis } = {'1': 'axial', '2': 'coronal', '3': 'sagittal'}
const AXIS_NORM_MAP: { [key: string]: Vec3D } = {'1': [0, 0, 1], '2': [0, 1, 0], '3': [1, 0, 0]}
const ROTATE_STEP = Math.PI / 180 // 1 degree per wheel tick

const sliceState = (anchor: Vec3D): SliceState => ({
    'mode': 'axial',
    'idx': { 'axial': 0, 'coronal': 0, 'sagittal': 0 },
    'anchor': anchor,
    'normal': [0, 0, 1]
})


const getMaxIdx = (shape: Vec3D, ax: string) => {
    if (ax === 'axial')
        return shape[0] - 1
    if (ax === 'coronal')
        return shape[1] - 1
    return shape[2] - 1
}

const normalizeVec = (v: Vec3D): Vec3D => {
    const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)
    return len < 1e-6 ? [0, 0, 1] : [v[0] / len, v[1] / len, v[2] / len]
}


const ViewPane = () => {
    const state = useAppState()
    const refContainer = useRef<HTMLDivElement | null>(null)
    const refScene = useRef<SceneManager | null>(null)

    const spaceHeld = useRef(false)
    const dualMode = useRef(false)

    const refState = useRef(state)
    const refActiveSlot = useRef(state.activeSlot)

    const refSlice = useRef<Record<string, SliceState>>({ 'A': sliceState([0, 0, 0]), 'B': sliceState([0, 0, 0]) })
    const refOpToken = useRef<Record<string, number>>({ 'A': 0, 'B': 0 })

    const refScanID = useRef<Record<string, string>>({ 'A': '', 'B': '' })
    const refMeshID = useRef<Record<string, string>>({ 'A': '', 'B': '' })

    refState.current = state
    refActiveSlot.current = state.activeSlot

    useEffect(() => {
        if (!refContainer.current)
            return

        const scene = new SceneManager(refContainer.current)
        scene.setActiveSlot(refActiveSlot.current)
        refScene.current = scene

        return () => {
            scene.dispose()
            refScene.current = null
        }
    }, [])

    const refreshSlice = async(slot: string): Promise<void> => {
        const scene = refScene.current
        const ds = refState.current.dataset[slot]

        if (!scene || !ds)
            return

        const slice = refSlice.current[slot]
        const idx = slice.idx[slice.mode]
        const token = ++refOpToken.current[slot]

        // arbitrary has no natural voxel-grid bound like the cardinal axes (shape[axis]-1,
        // starting at 0) — it's centered on the anchor, so the valid range is symmetric
        // around 0 instead, sized to the same bounding-box-diagonal bound used to size the
        // rendered image itself (see scene/scan.ts::arbitraryMaxIdx)
        const isArbitrary = slice.mode === 'arbitrary'
        const minIdx = isArbitrary ? -arbitraryMaxIdx(ds.scan) : 0
        const maxIdx = isArbitrary ? arbitraryMaxIdx(ds.scan) : getMaxIdx(ds.scan.shape, slice.mode)

        try {
            // index out of this dataset's own range (e.g. mismatched anchors/slice counts
            // between A and B) -> render a black placeholder in the slice's would-be position
            // instead of hitting the backend (which clamps and would return a real slice)
            if (idx < minIdx || idx > maxIdx) {
                const geometry = slice.mode === 'arbitrary'
                    ? arbitrarySliceGeometry(ds.scan, ds.anchor, slice.normal, idx)
                    : sliceGeometry(ds.scan, slice.mode, idx)
                const mesh = renderBlack(geometry)
                if (refOpToken.current[slot] !== token)
                    return

                mesh.visible = ds.scan.visible
                scene.setSlice(slot, 'primary', mesh)
                return
            }

            const res = slice.mode === 'arbitrary'
                ? await getArbitrarySlice(slot, slice.normal, idx)
                : await getOrthogonal(slot, slice.mode, idx)
            if (refOpToken.current[slot] !== token)
                return

            const mesh = await render(res)
            if (refOpToken.current[slot] !== token)
                return

            mesh.visible = ds.scan.visible
            scene.setSlice(slot, 'primary', mesh)
            console.log('Frame Update')
        }
        catch {

        }
    }

    useEffect(() => {
        const container = refContainer.current
        const scene = refScene.current
        if (!container || !scene)
            return        

        const onWheel = (e: WheelEvent) => {
            e.preventDefault()

            const slot = refActiveSlot.current
            const dataset = refState.current.dataset[slot]

            if (!dataset)
                return

            const slice = refSlice.current[slot]
            const sign = Math.sign(e.deltaY) || 1

            // zooming — scroll up (sign < 0) zooms in, scroll down (sign > 0) zooms out
            if (e.ctrlKey || e.metaKey) {
                scene.zoomCamera(sign)
                return
            }

            // rotating — orbit the camera about the axis normal to the active slot's current
            // view (axial -> SI, coronal -> AP, sagittal -> LR). Scroll up (sign < 0) rotates
            // clockwise, scroll down (sign > 0) rotates anticlockwise.
            if (spaceHeld.current) {
                scene.rotateCamera(slice.normal, sign * ROTATE_STEP)
                return
            }

            // slice scrolling — advance every loaded dataset's index together (for the
            // active axis) so indices stay in lockstep between A and B regardless of which
            // is currently visible. Each dataset's own bounds are enforced at render time
            // (see refreshSlice) rather than here, since clamping per-dataset here would
            // desync the two once one runs out of slices before the other.
            const mode = slice.mode
            const loadedSlots = ['A', 'B'].filter(s => refState.current.dataset[s])
            loadedSlots.forEach(s => {
                const sState = refSlice.current[s]
                sState.mode = mode
                sState.idx[mode] += sign
                refreshSlice(s)
            })
            console.log(`Normal Scrolling ${sign}`)
        }

        const onKeyDown = (e: KeyboardEvent) => {
            // hold space to modify scroll behaviour
            if ((e.code === 'space' || e.key === ' ') && !spaceHeld.current) {
                console.log('Spacebar held')
                spaceHeld.current = true
                return
            }

            // reset camera to how it was framed on load
            if (e.key === 'o' || e.key === 'O') {
                refScene.current?.resetCamera()
                return
            }

            // snap camera to a flat, face-on view of the active slot's current slice plane.
            // Guarded against focused text inputs (e.g. the anchor fields) since Enter is
            // also how those get submitted.
            if (e.key === 'Enter') {
                const tag = (document.activeElement as HTMLElement | null)?.tagName
                if (tag === 'INPUT' || tag === 'TEXTAREA')
                    return

                const mode = refSlice.current[refActiveSlot.current].mode
                if (mode === 'arbitrary')
                    return

                const { normal, up } = axisFrame(mode)
                refScene.current?.setOrthogonalView(normal, up)
                return
            }

            // dual mode — render both slots' contours together, scans hidden.
            // Contour visibility is untouched either way.
            if (e.key === 'd') {
                e.preventDefault()
                dualMode.current = true
                refScene.current?.setDualMode(true)

                // scene.setDualMode only hides the scan meshes currently in the scene —
                // refreshSlice (e.g. on scroll) stamps mesh.visible from dataset.scan.visible
                // on every newly created mesh, so without actually flipping that (the same
                // action onClickVisible in info.tsx performs) a scroll would bring it right
                // back. Force it off, same call, both loaded slots.
                const loadedSlots = ['A', 'B'].filter(s => refState.current.dataset[s])
                loadedSlots.forEach(s => refState.current.updateVisibility(s, 'scan', false))
                return
            }

            // toggle active slot — while in dual mode, Tab instead exits back to slot A only
            // (scans are left hidden; the visibility toggle in the info panel still works)
            if (e.key === 'Tab') {
                e.preventDefault()

                if (dualMode.current) {
                    dualMode.current = false
                    refScene.current?.setDualMode(false)
                    refState.current.setActiveSlot('A')
                    return
                }

                const newSlot = refState.current.activeSlot === 'A' ? 'B' : 'A'
                console.log(`Change active slot to ${newSlot}`)
                refState.current.setActiveSlot(newSlot)
                refreshSlice(newSlot)
                return
            }

            // toggle cardinal axis — applied to every loaded dataset (not just the active
            // one) so their slice indices stay comparable across slots, matching the wheel
            // scrolling behaviour above
            if (e.key === '1' || e.key === '2' || e.key === '3') {
                console.log(`Axis change: ${e.key}`)

                const mode = AXIS_NUM_MAP[e.key]
                const normal = AXIS_NORM_MAP[e.key]
                const loadedSlots = ['A', 'B'].filter(s => refState.current.dataset[s])
                loadedSlots.forEach(s => {
                    const sState = refSlice.current[s]
                    sState.normal = normal
                    sState.anchor = refState.current.dataset[s]?.anchor ?? [0, 0, 0]
                    sState.mode = mode
                    refreshSlice(s)
                })
                return
            }

            // arbitrary axis slicing — only activates with exactly two contours selected
            // (see info.tsx's select button / state.selected). The normal is the direction
            // between their centers of mass; the plane passes through each slot's own anchor
            // (the point that maps to world origin), matching how the cardinal axes are also
            // computed per-slot but share one normal/mode across both loaded slots.
            if (e.key === '4') {
                const sel = refState.current.selected
                if (sel.length !== 2)
                    return

                const comA = refState.current.dataset[sel[0].slot]?.contours[sel[0].id]?.center_of_mass
                const comB = refState.current.dataset[sel[1].slot]?.contours[sel[1].id]?.center_of_mass
                if (!comA || !comB)
                    return

                const normal = normalizeVec([comB[0] - comA[0], comB[1] - comA[1], comB[2] - comA[2]])

                const loadedSlots = ['A', 'B'].filter(s => refState.current.dataset[s])
                if (loadedSlots.length === 0)
                    return

                // size the visual axis line to whichever loaded dataset is active (falling
                // back to the other) — same bounding-box-diagonal extent the arbitrary slice
                // itself is sized to (see scene/scan.ts::arbitrarySliceGeometry)
                const refSlot = loadedSlots.includes(refActiveSlot.current) ? refActiveSlot.current : loadedSlots[0]
                const refDs = refState.current.dataset[refSlot]
                if (!refDs)
                    return
                const { width: extent } = arbitrarySliceGeometry(refDs.scan, refDs.anchor, normal, 0)
                refScene.current?.setArbitraryAxis(normal, extent)

                loadedSlots.forEach(s => {
                    const sState = refSlice.current[s]
                    sState.mode = 'arbitrary'
                    sState.normal = normal
                    sState.idx['arbitrary'] = 0
                    refreshSlice(s)
                })
                return
            }

            
        }

        const onKeyUp = (e: KeyboardEvent) => {
            if ((e.code === 'space' || e.key === ' ') && spaceHeld.current)
                console.log('Spacebar released')
                spaceHeld.current = false
        }

        container.addEventListener('wheel', onWheel, { passive: false })
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        return () => {
            container.removeEventListener('wheel', onWheel)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
        }
    }, [])

    useEffect(() => {
        refScene.current?.setActiveSlot(state.activeSlot)
    }, [state.activeSlot])

    useEffect(() => {
        const scene = refScene.current
        if (!scene)
            return

        ;['A', 'B'].forEach(slot => {
            const dataset = state.dataset[slot]
            if (!dataset) {
                scene.removeDataset(slot)
                scene.clearSlice(slot)

                refScanID.current[slot] = ''
                refMeshID.current[slot] = ''

                return
            }
            scene.setDatasetTrans(slot, dataset.anchor, dataset.alignment, dataset.render.rotation)
            scene.setScanVisibility(slot, dataset.scan.visible)

            if (refScanID.current[slot] !== dataset.scan.id) {
                refScanID.current[slot] = dataset.scan.id
                refSlice.current[slot] = sliceState(dataset.anchor)

                const [z, y, x] = dataset.scan.shape
                const [sZ, sY, sX] = dataset.scan.spacing

                refSlice.current[slot].idx = {
                    'axial': Math.floor((z - 1) / 2),
                    'coronal': Math.floor((y - 1) / 2),
                    'sagittal': Math.floor((x - 1) / 2),
                }

                // the anchor point always maps to world origin (see setDatasetTrans), which
                // is also where the axes are centered — so the camera should target origin,
                // not the dataset's raw (absolute patient-space) anchor coordinate
                scene.setCamera([0, 0, 0], Math.max(x * sX, y * sY, z * sZ) / 2)

                scene.setAxes(slot, [
                    (x - 1) * sX,
                    (y - 1) * sY,
                    (z - 1) * sZ,
                ])

                refreshSlice(slot)
            }
        })
    }, [
        state.dataset['A']?.scan.id,
        state.dataset['B']?.scan.id,
        state.dataset['A']?.scan.visible,
        state.dataset['B']?.scan.visible,
        JSON.stringify(state.dataset['A']?.render.rotation),
        JSON.stringify(state.dataset['B']?.render.rotation),
        JSON.stringify(state.dataset['A']?.anchor),
        JSON.stringify(state.dataset['B']?.anchor),
        JSON.stringify(state.dataset['A']?.alignment),
        JSON.stringify(state.dataset['B']?.alignment),
    ])

    useEffect(() => {
        const scene = refScene.current
        if (!scene)
            return

        ;['A', 'B'].forEach(slot => {
            const dataset = state.dataset[slot]
            const contours = Object.values(dataset?.contours ?? {})
            const liveIDs = new Set(contours.map(contour => contour.id))
            
            contours.forEach(contour => {
                if (!scene.rendered(slot, contour.id)) {
                    getContour(slot, contour.id).then(mesh => {
                        scene.renderContour(slot, contour.id, mesh, contour.color, 0.7, mesh.visible, false)
                    }).catch(err => console.error(`Failed to render contour ${contour.id}`, err))
                } else {
                    scene.setContourVisibility(slot, contour.id, contour.visible)
                }
            })

            if (dataset) {
                const rm: string[] = []
                contours.forEach(contour => {if (!liveIDs.has(contour.id)) rm.push(contour.id)})
                rm.forEach((id) => scene.removeContour(slot, id))
            }
        })
    }, [JSON.stringify(state.dataset['A']?.contours), JSON.stringify(state.dataset['B']?.contours)])


    return (
        <div className='view-pane' ref={refContainer}>
        </div>
    )
}

export default ViewPane