import { useEffect, useRef, useState } from 'react'
import { getArbitraryContourDMapSlice, getArbitraryContourSlice, getArbitrarySlice, getContour, getContourDMap, getContourDMapSlice, getContourSlice, getOrthogonal } from '../../api/client'
import SceneManager from '../../scene/manager'
import { arbitraryMaxIdx, arbitrarySliceGeometry, axisFrame, cardinalAnchorIdx, cardinalDim, cardinalIdxRange, render, renderBlack, renderOverlay, sliceGeometry } from '../../scene/scan'
import { useAppState } from '../../state'
import { Axis, Contour, Dataset, SliceState, Vec3D } from '../../types'
import View2DGrid, { AxisGrid, SliceImg } from './view2d'
import './view.css'


const AXIS_NUM_MAP: { [key: string]: Axis } = {'1': 'axial', '2': 'coronal', '3': 'sagittal'}
const AXIS_NORM_MAP: { [key: string]: Vec3D } = {'1': [0, 0, 1], '2': [0, 1, 0], '3': [1, 0, 0]}
const CARDINAL_AXES: Axis[] = ['axial', 'coronal', 'sagittal']
const ROTATE_STEP = Math.PI / 180

/** Builds a fresh cardinal-axis slice state, idx zeroed on every axis (0 = the dataset's own anchor slice). */
const _sliceState = (): SliceState => ({
    'mode': 'axial',
    'idx': { 'axial': 0, 'coronal': 0, 'sagittal': 0 },
    'normal': [0, 0, 1]
})


/** Normalizes a vector, falling back to +Z when it is (near) zero-length. */
const _normalizeVec = (v: Vec3D): Vec3D => {
    const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)
    return len < 1e-6 ? [0, 0, 1] : [v[0] / len, v[1] / len, v[2] / len]
}


const ViewPane = () => {
    const state = useAppState()
    const refOuter = useRef<HTMLDivElement | null>(null)
    const refContainer = useRef<HTMLDivElement | null>(null)
    const refScene = useRef<SceneManager | null>(null)

    const spaceHeld = useRef(false)
    const dualMode = useRef(false)
    const sliceMode = useRef(false)

    const [view2D, setView2D] = useState(false)
    const refView2D = useRef(false)
    const [focusAxis, setFocusAxis] = useState<Axis>('axial')
    const [grid2D, setGrid2D] = useState<Record<string, AxisGrid | null>>({ 'A': null, 'B': null })
    const ref2DOpToken = useRef<Record<string, Record<Axis, number>>>({
        'A': { 'axial': 0, 'coronal': 0, 'sagittal': 0 },
        'B': { 'axial': 0, 'coronal': 0, 'sagittal': 0 },
    })
    const ref2DWheelDebounce = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({})

    const refState = useRef(state)
    const refActiveSlot = useRef(state.activeSlot)

    const refSlice = useRef<Record<string, SliceState>>({ 'A': _sliceState(), 'B': _sliceState() })
    const refOpToken = useRef<Record<string, number>>({ 'A': 0, 'B': 0 })
    const refContourOpToken = useRef<Record<string, number>>({ 'A': 0, 'B': 0 })

    const refScanID = useRef<Record<string, string>>({ 'A': '', 'B': '' })
    const refMeshID = useRef<Record<string, string>>({ 'A': '', 'B': '' })
    const refAnchor = useRef<Record<string, string>>({ 'A': '', 'B': '' })

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
        const { min: minIdx, max: maxIdx } = isArbitrary
            ? { min: -arbitraryMaxIdx(ds.scan), max: arbitraryMaxIdx(ds.scan) }
            : cardinalIdxRange(ds.scan, ds.anchor, slice.mode as Axis)

        try {
            if (idx < minIdx || idx > maxIdx) {
                const geometry = slice.mode === 'arbitrary'
                    ? arbitrarySliceGeometry(ds.scan, ds.anchor, slice.normal, idx)
                    : sliceGeometry(ds.scan, slice.mode, idx, ds.anchor)
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

    /** Fetches one cardinal-axis slice image plus its visible contour overlays for the 2D grid, or a blank placeholder when out of range. The scan's own visibility toggle (3D-only) never hides it here — the 2D grid always shows the scan. */
    const _fetch2DAxisImage = async (slot: string, ds: Dataset, axis: Axis, idx: number, minIdx: number, maxIdx: number): Promise<SliceImg> => {
        const inRange = idx >= minIdx && idx <= maxIdx
        const arrayIdx = cardinalAnchorIdx(ds.scan, ds.anchor, axis) + idx
        const dim = cardinalDim(ds.scan, axis)

        let url: string | null = null
        if (inRange) {
            try {
                url = (await getOrthogonal(slot, axis, idx)).url
            } catch {}
        }

        const overlays: string[] = []
        if (inRange) {
            const visibleContours = Object.values(ds.contours).filter(c => c.visible)
            await Promise.all(visibleContours.map(async contour => {
                try {
                    const res = _isDMap(slot, contour.id)
                        ? await getContourDMapSlice(slot, contour.id, axis, idx)
                        : await getContourSlice(slot, contour.id, axis, idx)
                    overlays.push(res.url)
                } catch {}
            }))
        }

        return { axis, url, idx, arrayIdx, dim, overlays }
    }

    /** Fetches one axis's slice (+ overlays) for a slot's 2D grid and merges it into that slot's cached per-axis grid, leaving the other two axes' cached images untouched. */
    const _refresh2DAxis = async (slot: string, axis: Axis): Promise<void> => {
        const ds = refState.current.dataset[slot]
        if (!ds)
            return

        const idx = refSlice.current[slot].idx[axis] ?? 0
        const { min: minIdx, max: maxIdx } = cardinalIdxRange(ds.scan, ds.anchor, axis)
        const token = ++ref2DOpToken.current[slot][axis]

        const img = await _fetch2DAxisImage(slot, ds, axis, idx, minIdx, maxIdx)
        if (ref2DOpToken.current[slot][axis] !== token)
            return

        setGrid2D(prev => ({ ...prev, [slot]: { ...(prev[slot] ?? {}), [axis]: img } }))
    }

    /** Refreshes all three cardinal axes of a slot's 2D grid — used whenever something invalidates every axis at once (entering 2D mode, a dataset/contour/DMap change), never on a plain scroll. */
    const _refresh2DAllAxes = (slot: string): void => {
        const ds = refState.current.dataset[slot]
        if (!ds) {
            setGrid2D(prev => ({ ...prev, [slot]: null }))
            return
        }

        setGrid2D(prev => ({ ...prev, [slot]: prev[slot] ?? {} }))
        CARDINAL_AXES.forEach(axis => _refresh2DAxis(slot, axis))
    }

    /** Debounces a scroll-driven single-axis 2D grid refresh so a fast run of wheel ticks collapses into one fetch (per slot) once scrolling settles, instead of firing a request per tick. */
    const _debounced2DAxisRefresh = (slot: string, axis: Axis): void => {
        if (ref2DWheelDebounce.current[slot])
            clearTimeout(ref2DWheelDebounce.current[slot])

        ref2DWheelDebounce.current[slot] = setTimeout(() => {
            ref2DWheelDebounce.current[slot] = undefined
            _refresh2DAxis(slot, axis)
        }, 60)
    }

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
        const { min: minIdx, max: maxIdx } = isArbitrary
            ? { min: -arbitraryMaxIdx(ds.scan), max: arbitraryMaxIdx(ds.scan) }
            : cardinalIdxRange(ds.scan, ds.anchor, slice.mode as Axis)
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
        const container = refOuter.current
        const scene = refScene.current
        if (!container || !scene)
            return

        /** Nudges every loaded slot's current-axis slice index by `sign` (one step), same effect whether triggered by wheel or arrow key, in either view mode. */
        const _nudgeSlice = (sign: number) => {
            const slot = refActiveSlot.current
            const dataset = refState.current.dataset[slot]

            if (!dataset)
                return

            const mode = refSlice.current[slot].mode
            const loadedSlots = ['A', 'B'].filter(s => refState.current.dataset[s])
            loadedSlots.forEach(s => {
                const sState = refSlice.current[s]
                sState.mode = mode
                sState.idx[mode] += sign
                if (refView2D.current)
                    _debounced2DAxisRefresh(s, mode as Axis)
                else
                    _refreshSlice(s)
            })
            console.log(`Normal Scrolling ${sign}`)
        }

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
                if (!refView2D.current)
                    scene.zoomCamera(sign)
                return
            }

            if (spaceHeld.current) {
                if (!refView2D.current)
                    scene.rotateCamera(slice.normal, sign * ROTATE_STEP)
                return
            }

            _nudgeSlice(sign)
        }

        /** Handles view keybindings: camera reset/flat-view, dual mode, active-slot toggle, axis switching, arbitrary-axis slicing, and slice-overlay mode. */
        const _onKeyDown = (e: KeyboardEvent) => {
            if ((e.code === 'space' || e.key === ' ') && !spaceHeld.current) {
                console.log('Spacebar held')
                spaceHeld.current = true
                return
            }

            if (e.key === 'v' || e.key === 'V') {
                e.preventDefault()

                const next = !refView2D.current
                refView2D.current = next
                setView2D(next)
                refScene.current?.setPaused(next)

                const loadedSlots = ['A', 'B'].filter(s => refState.current.dataset[s])
                loadedSlots.forEach(s => {
                    if (next && refSlice.current[s].mode === 'arbitrary')
                        refSlice.current[s].mode = 'axial'
                })

                if (next) {
                    const mode = refSlice.current[loadedSlots[0]]?.mode
                    setFocusAxis(mode && mode !== 'arbitrary' ? mode : 'axial')
                    loadedSlots.forEach(s => _refresh2DAllAxes(s))
                } else {
                    loadedSlots.forEach(s => _refreshSlice(s))
                }
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
                    sState.mode = mode
                })

                // In 2D mode all three axes are already cached per-slot (see _refresh2DAllAxes) —
                // switching which one is the focus pane is a pure re-layout, no refetch needed.
                if (refView2D.current)
                    setFocusAxis(mode)
                else
                    loadedSlots.forEach(s => _refreshSlice(s))
                return
            }

            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                const tag = (document.activeElement as HTMLElement | null)?.tagName
                if (tag === 'INPUT' || tag === 'TEXTAREA')
                    return

                e.preventDefault()
                _nudgeSlice(e.key === 'ArrowUp' ? -1 : 1)
                return
            }

            // The remaining keybindings are 3D-scene-specific (camera, dual mode, active-slot
            // switching, arbitrary-axis slicing, contour-mesh/overlay toggling) and have no
            // meaning in the flat 2D grid, which already shows both slots' cardinal axes at once.
            if (refView2D.current)
                return

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
            Object.values(ref2DWheelDebounce.current).forEach(t => t && clearTimeout(t))
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
                refAnchor.current[slot] = ''

                return
            }
            scene.setDatasetTrans(slot, dataset.anchor, dataset.alignment, dataset.render.rotation)
            scene.setScanVisibility(slot, dataset.scan.visible)
            _refreshContourSlices(slot)

            const isNewScan = refScanID.current[slot] !== dataset.scan.id
            const anchorKey = JSON.stringify(dataset.anchor)
            const anchorChanged = !isNewScan && refAnchor.current[slot] !== anchorKey
            refAnchor.current[slot] = anchorKey

            if (isNewScan) {
                refScanID.current[slot] = dataset.scan.id
                refSlice.current[slot] = _sliceState()

                const [z, y, x] = dataset.scan.shape
                const [sZ, sY, sX] = dataset.scan.spacing

                scene.setCamera([0, 0, 0], Math.max(x * sX, y * sY, z * sZ) / 2)

                scene.setAxes(slot, [
                    (x - 1) * sX,
                    (y - 1) * sY,
                    (z - 1) * sZ,
                ])

                _refreshSlice(slot)
            } else if (anchorChanged) {
                // Anchor is the cardinal-axis idx reference point (idx=0 = the anchor's own
                // slice) — repinning it makes the previous idx point at a different physical
                // offset, so snap back to the new anchor's slice on all three axes.
                refSlice.current[slot].idx = { 'axial': 0, 'coronal': 0, 'sagittal': 0 }
                if (!refView2D.current)
                    _refreshSlice(slot)
            }

            if (refView2D.current)
                _refresh2DAllAxes(slot)
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

            if (refView2D.current)
                _refresh2DAllAxes(slot)
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

            if (refView2D.current)
                _refresh2DAllAxes(slot)
        })
    }, [JSON.stringify(state.dmapContours)])


    return (
        <div className='view-pane' ref={refOuter}>
            <div className='view-3d' ref={refContainer} style={view2D ? { display: 'none' } : undefined} />
            {view2D && <View2DGrid grids={grid2D} focusAxis={focusAxis} />}
        </div>
    )
}

export default ViewPane
