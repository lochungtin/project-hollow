import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { getOrthogonal } from '../../api/client'
import SceneManager from '../../scene/manager'
import { render } from '../../scene/scan'
import { useAppState } from '../../state'
import { SliceState, Vec3D } from '../../types'
import './view.css'


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


const ViewPane = () => {
    const state = useAppState()
    const refContainer = useRef<HTMLDivElement | null>(null)
    const refScene = useRef<SceneManager | null>(null)

    const spaceHeld = useRef(false)

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
        refScene.current = scene

        return () => {
            scene.dispose()
            refScene.current = null
        }
    })

    const refreshSlice = async(slot: string): Promise<void> => {
        const scene = refScene.current
        const ds = refState.current.dataset[slot]

        if (!scene || !ds)
            return

        const slice = refSlice.current[slot]
        const token = ++refOpToken.current[slot]

        try {
            const res = await getOrthogonal(slot, slice.mode, slice.idx[slice.mode])
            if (refOpToken.current[slot] !== token)
                return

            const mesh = await render(res)
            if (refOpToken.current[slot] !== token)
                return
            
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

            // zooming
            if (e.ctrlKey || e.metaKey) {
                console.log(`[CTRL] Modified Scrolling:  ${sign}`)
                return
            }

            // rotating
            if (spaceHeld.current) {
                console.log(`[SPACE] Modified Scrolling:  ${sign}`)
                return
            }
            
            // slice scrolling
            const mx = getMaxIdx(dataset.scan.shape, slice.mode)
            slice.idx[slice.mode] = THREE.MathUtils.clamp(slice.idx[slice.mode] + sign, 0, mx)
            
            refreshSlice(slot)
            console.log(`Normal Scrolling ${sign}`)
        }

        const onKeyDown = (e: KeyboardEvent) => {
            // hold space to modify scroll behaviour
            if ((e.code === 'space' || e.key === ' ') && !spaceHeld.current) {
                console.log('Spacebar held')
                spaceHeld.current = true
                return
            }
            
            // toggle cardinal axis
            if (e.key === '1' || e.key === '2' || e.key === '3') {
                console.log(`Axis change: ${e.key}`)
                return
            }

            // switch to arbitrary axis
            if (e.key === '4') {
                console.log(`Axis change: ${e.key}`)
                return
            }

            // toggle active slot
            if (e.key === 'Tab') {
                e.preventDefault()
                const newSlot = refState.current.activeSlot === 'A' ? 'B' : 'A'
                console.log(`Change active slot to ${newSlot}`)
                refState.current.setActiveSlot(newSlot)
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

            if (refScanID.current[slot] !== dataset.scan.id) {
                refScanID.current[slot] = dataset.scan.id
                refSlice.current[slot] = sliceState(dataset.anchor)

                const shape = dataset.scan.shape
                const [z, y, x] = shape
                const [sZ, sY, sX] = dataset.scan.spacing

                refSlice.current[slot].idx = {
                    'axial': Math.floor((z - 1) / 2),
                    'coronal': Math.floor((y - 1) / 2),
                    'sagittal': Math.floor((x - 1) / 2),
                }

                scene.setCamera(dataset.anchor, Math.max(x * sX, y * sY, z * sZ) / 2)
                refreshSlice(slot)
            }
        })
    }, [
        state.dataset['A']?.scan.id,
        state.dataset['B']?.scan.id,
        JSON.stringify(state.dataset['A']?.render.rotation),
        JSON.stringify(state.dataset['B']?.render.rotation),
        JSON.stringify(state.dataset['A']?.anchor),
        JSON.stringify(state.dataset['B']?.anchor),
        JSON.stringify(state.dataset['A']?.alignment),
        JSON.stringify(state.dataset['B']?.alignment),
    ])


    return (
        <div className='view-pane' ref={refContainer}>
        </div>
    )
}

export default ViewPane