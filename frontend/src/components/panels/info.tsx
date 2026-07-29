import Anchor from '../../icons/anchor.svg'
import Close from '../../icons/close.svg'
import Select from '../../icons/select.svg'
import Target from '../../icons/target.svg'
import './info.css'

const ContentEmpty = () => {
    return (
        <>
            <main className='card-body'>
                <button className='dcm-upload'>
                    Load DICOM Series
                </button>
                <input 
                    type='file' multiple accept='.dcm,application/dicom' style={{ display: 'none' }}
                    onChange={(e) => {}}
                />
            </main>
            <footer className='card-footer'>
                Select every file in the dicom series.
            </footer>
        </>
    )
}

const ContentLoaded = () => {
    return (
        <>
            <main className='card-body'>
                <dl className='meta'>
                    <dt>Modality</dt><dd className='mono'>MR</dd>
                    <dt>Shape</dt><dd className='mono'>133 x 200 x 200</dd>
                    <dt>Spacing</dt><dd className='mono'>2.00 x 2.00 x 2.00 mm</dd>
                </dl>
                <div className='anchor-container'>
                    <div className='anchor-row'>
                        <span className='anchor-label'>Anchor (mm)</span>
                        <div className='anchor-controls'>
                            <input className='anchor-input mono'/>
                            <input className='anchor-input mono'/>
                            <input className='anchor-input mono'/>
                        </div>
                    </div>
                    <div className='anchor-row'>
                        <span className='anchor-label'>Anchor (px)</span>
                        <div className='anchor-controls'>
                            <input className='anchor-input mono'/>
                            <input className='anchor-input mono'/>
                            <input className='anchor-input mono'/>
                        </div>
                    </div>
                    <button className='anchor-set'>Set Anchor</button>
                </div>
                <button className='dcm-upload'>Load RTSTRUCT</button>
            </main>
            {1 ? ContourList() : <footer className='card-footer'>Load contours for more options.</footer>}
        </>
    )
}

const ContourList = () => {
    const contours = ['Body', 'Breast_L', 'Breast_R', 'Esophagus', 'Heart', 'Lung_L', 'Lung_R', 'Spinal_Canal']
    return (
        <div className='contour-container'>
            {contours.map((c, i) => {
                return <button key={i} className='contour-item'>
                    <div className={`contour-label ${i % 7 ? 'contour-label-active' : ''}`}>
                        <div className='contour-badge'></div>
                        <span className='contour-name'>{c}</span>
                    </div>
                    <div className='contour-action-container'>
                        <button className='contour-action'>
                            <img className='contour-action-img'src={Anchor} alt="A"/>
                        </button>
                        <button className='contour-action'>
                            <img className='contour-action-img'src={Target} alt="T"/>
                        </button>
                        <button className='contour-action'>
                            <img className='contour-action-img'src={Select} alt="S"/>
                        </button>
                    </div>
                </button>
            })}
        </div>
    )
}

const Card = ({slot}: {slot: string}) => {
    return (
        <section className={`card ${1 ? 'card-active' : ''}`}>
            <header className='card-header'>
                <span className='card-badge'>{slot}</span>
                <span className='card-name'>{1 ? `Dataset ${slot}` : 'Empty Slot'}</span>
                <span className='card-tag'>Active</span>
                <button className='card-close'>
                   <img className='card-close-img' src={Close} alt='close' />
                </button>
            </header>
            {1 ? ContentLoaded() : ContentEmpty()}
        </section>
    )
}

const InfoPane = () => {
    return (
        <nav className='pane'>
            <Card slot='A' />
            <Card slot='B' />
        </nav>
    )
}

export default InfoPane
