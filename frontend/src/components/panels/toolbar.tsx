import { useAppState } from '../../state'
import './toolbar.css'


const Toolbar = () => {
    const state = useAppState()

    return (
        <header className='toolbar-root'>
            <div className='toolbar-brand'>
                <span className='toolbar-title'>
                    Project
                    <span className='accent'> Hollow</span>
                </span>
                <span className='toolbar-subtitle'>Powered by Guava-RT</span>
            </div>
            <div className='toolbar-status'>
                <div className='toolbar-pill'>
                    <span>{state.device.toUpperCase()}</span>
                </div>                
                <span className='toolbar-hints mono'>
                    [Tab] dataset &middot;
                    [D] dual mode &middot;
                    [1/2/3] change axis &middot;
                    [4] arbitrary axis &middot;
                    [Scroll] slice &middot;
                    [Space + Scroll] rotate &middot;
                    [Ctrl + Scroll] zoom &middot;
                    [Enter] flat view &middot;
                    [O] reset camera
                </span>
            </div>
        </header>
    )
}

export default Toolbar