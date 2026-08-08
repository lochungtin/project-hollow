import { useEffect, useRef } from 'react'
import { useAppState } from '../../state'
import './view.css'


const ViewPane = () => {
    const state = useAppState()
    const refContainer = useRef<HTMLDivElement | null>(null)
    const refScene = useRef<HTMLDivElement | null>(null)

    const spaceHeld = useRef(false)

    const refState = useRef(state)
    const refActiveSlot = useRef(state.activeSlot)

    refState.current = state
    refActiveSlot.current = state.activeSlot

    useEffect(() => {
        const container = refContainer.current
        const scene = refScene.current
        // if (!container || !scene)
            // return

        const onWheel = (e: WheelEvent) => {
            e.preventDefault()

            // zooming
            if (e.ctrlKey || e.metaKey) {
                console.log(`[CTRL] Modified Scrolling:  ${e.deltaY}`)
                return
            }

            // rotating
            if (spaceHeld.current) {
                console.log(`[SPACE] Modified Scrolling:  ${e.deltaY}`)
                return
            }
            
            // slice scrolling
            console.log(`Normal Scrolling ${e.deltaY}`)
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


    return (
        <div className='view-pane' ref={refContainer}>
        </div>
    )
}

export default ViewPane