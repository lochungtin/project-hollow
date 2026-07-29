import Anchor from '../../icons/anchor.svg'
import Close from '../../icons/close.svg'
import Select from '../../icons/select.svg'
import Target from '../../icons/target.svg'
import './info.css'


const ContentEmpty = () => {
    return (
        <>
            <main className='info-card-body'>
                <button className='info-dcm-upload'>
                    Load DICOM Series
                </button>
                <input 
                    type='file' multiple accept='.dcm,application/dicom' style={{ display: 'none' }}
                    onChange={(e) => {}}
                />
            </main>
            <footer className='info-card-footer'>
                Select every file in the dicom series.
            </footer>
        </>
    )
}

const ContentLoaded = () => {
    return (
        <>
            <main className='info-card-body'>
                <dl className='info-meta'>
                    <dt>Modality</dt><dd className='info-mono'>MR</dd>
                    <dt>Shape</dt><dd className='info-mono'>133 x 200 x 200</dd>
                    <dt>Spacing</dt><dd className='info-mono'>2.00 x 2.00 x 2.00 mm</dd>
                </dl>
                <div className='info-anchor-container'>
                    <div className='info-anchor-row'>
                        <span className='info-anchor-label'>Anchor (mm)</span>
                        <div className='info-anchor-controls'>
                            <input className='info-anchor-input mono'/>
                            <input className='info-anchor-input mono'/>
                            <input className='info-anchor-input mono'/>
                        </div>
                    </div>
                    <div className='info-anchor-row'>
                        <span className='info-anchor-label'>Anchor (px)</span>
                        <div className='info-anchor-controls'>
                            <input className='info-anchor-input mono'/>
                            <input className='info-anchor-input mono'/>
                            <input className='info-anchor-input mono'/>
                        </div>
                    </div>
                    <button className='info-anchor-set'>Set Anchor</button>
                </div>
                <button className='info-dcm-upload'>Load RTSTRUCT</button>
            </main>
            {1 ? ContourList() : <footer className='info-card-footer'>Load contours for more options.</footer>}
        </>
    )
}

const ContourList = () => {
    const contours = ['Body', 'Breast_L', 'Breast_R', 'Esophagus', 'Heart', 'Lung_L', 'Lung_R', 'Spinal_Canal']
    return (
        <div className='info-contour-container'>
            {contours.map((c, i) => {
                return <button key={i} className='info-contour-item'>
                    <div className={`info-contour-label ${i % 7 ? 'info-contour-label-active' : ''}`}>
                        <div className='info-contour-badge'></div>
                        <span className='info-contour-name'>{c}</span>
                    </div>
                    <div className='info-contour-action-container'>
                        <button className='info-contour-action'>
                            <img className='info-contour-action-img'src={Anchor} alt="A"/>
                        </button>
                        <button className='info-contour-action'>
                            <img className='info-contour-action-img'src={Target} alt="T"/>
                        </button>
                        <button className='info-contour-action'>
                            <img className='info-contour-action-img'src={Select} alt="S"/>
                        </button>
                    </div>
                </button>
            })}
        </div>
    )
}

const Card = ({slot}: {slot: string}) => {
    return (
        <section className={`info-card ${1 ? 'info-card-active' : ''}`}>
            <header className='info-card-header'>
                <span className='info-card-badge'>{slot}</span>
                <span className='info-card-name'>{1 ? `Dataset ${slot}` : 'Empty Slot'}</span>
                <span className='info-card-tag'>Active</span>
                <button className='info-card-close'>
                   <img className='info-card-close-img' src={Close} alt='close' />
                </button>
            </header>
            {1 ? ContentLoaded() : ContentEmpty()}
        </section>
    )
}

const InfoPane = () => {
    return (
        <nav className='info-pane'>
            <Card slot='A' />
            <Card slot='B' />
        </nav>
    )
}

export default InfoPane
