import { useEffect, useRef } from 'react'
import { getArbitraryContourDMapSlice, getArbitraryContourSlice, getArbitrarySlice, getContour, getContourDMap, getContourDMapSlice, getContourSlice, getOrthogonal } from '../../api/client'
import SceneManager from '../../scene/manager'
import { arbitraryMaxIdx, arbitrarySliceGeometry, axisFrame, render, renderBlack, renderOverlay, sliceGeometry } from '../../scene/scan'
import { useAppState } from '../../state'
import { Axis, Contour, SliceState, Vec3D } from '../../types'
import './view.css'


const AXIS_NUM_MAP: { [key: string]: Axis } = {'1': 'axial', '2': 'coronal', '3': 'sagittal'}
const AXIS_NORM_MAP: { [key: string]: Vec3D } = {'1': [0, 0, 1], '2': [0, 1, 0], '3': [1, 0, 0]}
const ROTATE_STEP = Math.PI / 180

/** Builds a fresh cardinal-axis slice state centered on the given anchor. */
const _sliceState = (anchor: Vec3D): SliceState => ({
    'mode': 'axial',
    'idx': { 'axial': 0, 'coronal': 0, 'sagittal': 0 },
    'anchor': anchor,
    'normal': [0, 0, 1]
})


/** Returns the maximum valid cardinal-axis slice index for a scan shape. */
const _getMaxIdx = (shape: Vec3D, ax: string) => {
    if (ax === 'axial')
        return shape[0] - 1
    if (ax === 'coronal')
        return shape[1] - 1
    return shape[2] - 1
}

/** Normalizes a vector, falling back to +Z when it is (near) zero-length. */
const _normalizeVec = (v: Vec3D): Vec3D => {
    const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)
    return len < 1e-6 ? [0, 0, 1] : [v[0] / len, v[1] / len, v[2] / len]
}


const ViewPane = () => {
    const state = useAppState()
    const refContainer = useRef<HTMLDivElement | null>(null)
    const refScene = useRef<SceneManager | null>(null)

    const spaceHeld = useRef(false)
    const dualMode = useRef(false)
    const sliceMode = useRef(false)

    const refState = useRef(state)
    const refActiveSlot = useRef(state.activeSlot)

    const refSlice = useRef<Record<string, SliceState>>({ 'A': _sliceState([0, 0, 0]), 'B': _sliceState([0, 0, 0]) })
    const refOpToken = useRef<Record<string, number>>({ 'A': 0, 'B': 0 })
    const refContourOpToken = useRef<Record<string, number>>({ 'A': 0, 'B': 0 })

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

    /** Fetches and renders the active scan slice for a slot (or a black placeholder if the index is out of range), then refreshes its contour overlays. */
    const _refreshSlice = async(slot: string): Promise<void> => {
        const scene = refScene.current
        const ds = refState.current.dataset[slot]

        if (!scene || !ds)
            return

        const slice = refSlice.current[slot]
        const idx = slice.idx[slice.mode]
        const token = ++refOpToken.current[slot]

        const isArbitrary = slice.mode === 'arbitrary'
        const minIdx = isArbitrary ? -arbitraryMaxIdx(ds.scan) : 0
        const maxIdx = isArbitrary ? arbitraryMaxIdx(ds.scan) : _getMaxIdx(ds.scan.shape, slice.mode)

        try {
            if (idx < minIdx || idx > maxIdx) {
                const geometry = slice.mode === 'arbitrary'
                    ? arbitrarySliceGeometry(ds.scan, ds.anchor, slice.normal, idx)
                    : sliceGeometry(ds.scan, slice.mode, idx)
                const mesh = renderBlack(geometry)
                if (refOpToken.current[slot] !== token)
                    return

                mesh.visible = ds.scan.visible
                scene.setSlice(slot, 'primary', mesh)
                _refreshContourSlices(slot)
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
            _refreshContourSlices(slot)
            console.log('Frame Update')
        }
        catch {

        }
    }

    /** Returns whether a contour is currently shown against the target's distance map instead of its flat color. */
    const _isDMap = (slot: string, id: string): boolean =>
        refState.current.dmapContours.some(s => s.slot === slot && s.id === id)

    /** Fetches and renders a single contour's 3D mesh, branching between the flat-color and distance-map-colored endpoints. */
    const _loadContourMesh = async (slot: string, contour: Contour): Promise<void> => {
        const scene = refScene.current
        if (!scene)
            return

        const visible = contour.visible && !sliceMode.current
        try {
            if (_isDMap(slot, contour.id)) {
                const mesh = await getContourDMap(slot, contour.id)
                scene.renderContour(slot, contour.id, mesh, contour.color, 0.7, visible, false, mesh.colors)
            } else {
                const mesh = await getContour(slot, contour.id)
                scene.renderContour(slot, contour.id, mesh, contour.color, 0.7, visible, false)
            }
        } catch (err) {
            console.error(`Failed to render contour ${contour.id}`, err)
        }
    }

    /** Fetches and draws each visible contour's 2D cross-section at the current slice, pruning overlays for contours no longer visible; a no-op when slice-overlay mode is off. */
    const _refreshContourSlices = async (slot: string): Promise<void> => {
        const scene = refScene.current
        const ds = refState.current.dataset[slot]

        if (!scene || !ds)
            return

        const token = ++refContourOpToken.current[slot]

        if (!sliceMode.current) {
            scene.clearOverlays(slot)
            return
        }

        const slice = refSlice.current[slot]
        const idx = slice.idx[slice.mode]
        const isArbitrary = slice.mode === 'arbitrary'
        const minIdx = isArbitrary ? -arbitraryMaxIdx(ds.scan) : 0
        const maxIdx = isArbitrary ? arbitraryMaxIdx(ds.scan) : _getMaxIdx(ds.scan.shape, slice.mode)
        const inRange = idx >= minIdx && idx <= maxIdx

        const visibleContours = inRange ? Object.values(ds.contours).filter(c => c.visible) : []

        const liveKeys = new Set(visibleContours.map(c => `contour:${c.id}`))
        scene.pruneOverlays(slot, liveKeys)

        if (!inRange)
            return

        await Promise.all(visibleContours.map(async (contour, i) => {
            try {
                const dmap = _isDMap(slot, contour.id)
                const res = isArbitrary
                    ? dmap
                        ? await getArbitraryContourDMapSlice(slot, contour.id, slice.normal, idx)
                        : await getArbitraryContourSlice(slot, contour.id, slice.normal, idx)
                    : dmap
                        ? await getContourDMapSlice(slot, contour.id, slice.mode, idx)
                        : await getContourSlice(slot, contour.id, slice.mode, idx)
                if (refContourOpToken.current[slot] !== token)
                    return

                const mesh = await renderOverlay(res)
                if (refContourOpToken.current[slot] !== token)
                    return

                mesh.renderOrder = i + 1
                scene.setOverlay(slot, `contour:${contour.id}`, mesh)
            } catch {

            }
        }))
    }

    /** Syncs each rendered contour's 3D visibility with slice-overlay mode and refreshes the 2D overlays to match. */
    const _syncContourMode = (slot: string) => {
        const scene = refScene.current
        const dataset = refState.current.dataset[slot]
        if (!scene || !dataset)
            return

        Object.values(dataset.contours).forEach(contour => {
            if (scene.rendered(slot, contour.id))
                scene.setContourVisibility(slot, contour.id, contour.visible && !sliceMode.current)
        })
        _refreshContourSlices(slot)
    }

    useEffect(() => {
        const container = refContainer.current
        const scene = refScene.current
        if (!container || !scene)
            return

        /** Handles zoom (Ctrl/Cmd), camera orbit (Space), and slice-index scrolling. */
        const _onWheel = (e: WheelEvent) => {
            e.preventDefault()

            const slot = refActiveSlot.current
            const dataset = refState.current.dataset[slot]

            if (!dataset)
                return

            const slice = refSlice.current[slot]
            const sign = Math.sign(e.deltaY) || 1

            if (e.ctrlKey || e.metaKey) {
                scene.zoomCamera(sign)
                return
            }

            if (spaceHeld.current) {
                scene.rotateCamera(slice.normal, sign * ROTATE_STEP)
                return
            }

            const mode = slice.mode
            const loadedSlots = ['A', 'B'].filter(s => refState.current.dataset[s])
            loadedSlots.forEach(s => {
                const sState = refSlice.current[s]
                sState.mode = mode
                sState.idx[mode] += sign
                _refreshSlice(s)
            })
            console.log(`Normal Scrolling ${sign}`)
        }

        /** Handles view keybindings: camera reset/flat-view, dual mode, active-slot toggle, axis switching, arbitrary-axis slicing, and slice-overlay mode. */
        const _onKeyDown = (e: KeyboardEvent) => {
            if ((e.code === 'space' || e.key === ' ') && !spaceHeld.current) {
                console.log('Spacebar held')
                spaceHeld.current = true
                return
            }

            if (e.key === 'o' || e.key === 'O') {
                refScene.current?.resetCamera()
                return
            }

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

            if (e.key === 'd') {
                e.preventDefault()
                dualMode.current = true
                refScene.current?.setDualMode(true)

                const loadedSlots = ['A', 'B'].filter(s => refState.current.dataset[s])
                loadedSlots.forEach(s => refState.current.updateVisibility(s, 'scan', false))

                loadedSlots.forEach(s => _syncContourMode(s))
                return
            }

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
                _refreshSlice(newSlot)
                return
            }

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
                    _refreshSlice(s)
                })
                return
            }

            if (e.key === '4') {
                const sel = refState.current.selected
                if (sel.length !== 2)
                    return

                const comA = refState.current.dataset[sel[0].slot]?.contours[sel[0].id]?.center_of_mass
                const comB = refState.current.dataset[sel[1].slot]?.contours[sel[1].id]?.center_of_mass
                if (!comA || !comB)
                    return

                const normal = _normalizeVec([comB[0] - comA[0], comB[1] - comA[1], comB[2] - comA[2]])

                const loadedSlots = ['A', 'B'].filter(s => refState.current.dataset[s])
                if (loadedSlots.length === 0)
                    return

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
                    _refreshSlice(s)
                })
                return
            }

            if (e.key === 'm') {
                sliceMode.current = !sliceMode.current
                const loadedSlots = ['A', 'B'].filter(s => refState.current.dataset[s])
                loadedSlots.forEach(s => _syncContourMode(s))
                return
            }
        }

        /** Clears the space-held rotate modifier on release. */
        const _onKeyUp = (e: KeyboardEvent) => {
            if ((e.code === 'space' || e.key === ' ') && spaceHeld.current)
                console.log('Spacebar released')
                spaceHeld.current = false
        }

        container.addEventListener('wheel', _onWheel, { passive: false })
        window.addEventListener('keydown', _onKeyDown)
        window.addEventListener('keyup', _onKeyUp)
        return () => {
            container.removeEventListener('wheel', _onWheel)
            window.removeEventListener('keydown', _onKeyDown)
            window.removeEventListener('keyup', _onKeyUp)
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
            _refreshContourSlices(slot)

            if (refScanID.current[slot] !== dataset.scan.id) {
                refScanID.current[slot] = dataset.scan.id
                refSlice.current[slot] = _sliceState(dataset.anchor)

                const [z, y, x] = dataset.scan.shape
                const [sZ, sY, sX] = dataset.scan.spacing

                refSlice.current[slot].idx = {
                    'axial': Math.floor((z - 1) / 2),
                    'coronal': Math.floor((y - 1) / 2),
                    'sagittal': Math.floor((x - 1) / 2),
                }

                scene.setCamera([0, 0, 0], Math.max(x * sX, y * sY, z * sZ) / 2)

                scene.setAxes(slot, [
                    (x - 1) * sX,
                    (y - 1) * sY,
                    (z - 1) * sZ,
                ])

                _refreshSlice(slot)
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
                    _loadContourMesh(slot, contour).then(() => _syncContourMode(slot))
                }
            })

            if (dataset) {
                const rm: string[] = []
                contours.forEach(contour => {if (!liveIDs.has(contour.id)) rm.push(contour.id)})
                rm.forEach((id) => scene.removeContour(slot, id))
            }

            _syncContourMode(slot)
        })
    }, [JSON.stringify(state.dataset['A']?.contours), JSON.stringify(state.dataset['B']?.contours)])

    useEffect(() => {
        const scene = refScene.current
        if (!scene)
            return

        ;['A', 'B'].forEach(slot => {
            const dataset = state.dataset[slot]
            if (!dataset)
                return

            Object.values(dataset.contours).forEach(contour => {
                if (scene.rendered(slot, contour.id))
                    _loadContourMesh(slot, contour)
            })
            _refreshContourSlices(slot)
        })
    }, [JSON.stringify(state.dmapContours)])


    return (
        <div className='view-pane' ref={refContainer}>
        </div>
    )
}

export default ViewPane
