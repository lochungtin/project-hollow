import './toolbar.css'


// STATE INTEGRATION

const Toolbar = () => {
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
                    <span>CUDA</span>
                </div>                
                <span className='toolbar-hints mono'>
                    [Tab] dataset &middot;
                    [1/2/3/4] change axis &middot;
                    [R] toggle rotation &middot;
                    [Scroll] slice/rotate &middot;
                    [Ctrl + Scroll] zoom
                </span>
            </div>
        </header>
    )
}

export default Toolbar