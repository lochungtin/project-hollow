import { useRef, useState } from 'react'
import Anchor from '../../icons/anchor.svg'
import Close from '../../icons/close.svg'
import DMap from '../../icons/dmap.svg'
import Select from '../../icons/select.svg'
import Target from '../../icons/target.svg'
import { useAppState } from '../../state'
import './info.css'


const ContentEmpty = ({slot}: {slot: string}) => {
    const state = useAppState()

    const dicomUploadRef = useRef(null)

    // --- UPLOAD DICOM FILES
    const _onClickDcmUpload = (e: any, slot: string) => {
        console.log('_onClickUpload', slot)
        if (dicomUploadRef.current)
            dicomUploadRef.current.click()
    }
    const _onDcmUpload = (e: any, slot: string) => {
        console.log('_onUpload', slot, e.target.files.length)
        
        if (e.target.files && e.target.files.length > 0)
            state.uploadDicom(slot, e.target.files)
        e.target.value = ''
    }

    return (
        <>
            <main className='info-card-body'>
                <button className='info-dcm-upload' onClick={(e) => _onClickDcmUpload(e, slot)}>
                    {state.uploading[slot] ? 'Uploading ...' : 'Load DICOM Series'}
                </button>
                <input 
                    ref={dicomUploadRef}
                    type='file'
                    multiple accept='.dcm,application/dicom'
                    style={{ display: 'none' }}
                    onChange={(e) => _onDcmUpload(e, slot)}
                />
            </main>
            <footer className='info-card-footer'>
                Select every file in the dicom series.
            </footer>
        </>
    )
}

const ContentLoaded = ({slot}: {slot: string}) => {
    const state = useAppState()

    const ds = state.dataset[slot]
    const scan = ds.scan

    const modality = scan.modality
    const shape = scan.shape.join(' x ')
    const spacing = scan.spacing.map((x: number) => x.toFixed(2)).join(' x ')

    const [anchorMM, setAnchorMM] = useState(ds.anchor.map((x: number) => x / scan.spacing[0]))
    const [anchorPX, setAnchorPX] = useState(ds.anchor)

    // --- UPLOAD RT STRUCT FILES
    const _onClickStructUpload = (e: any, slot: string) => {
        console.log('_onClickUpload', slot)
    }
    const _onStructUpload = (e: any, slot: string) => {
        console.log('_onUpload', slot)
    }

    // --- ANCHOR CHANGES MM
    const _onAnchorMMChange = (e: any, slot: string, axes: number) => {
        console.log('_onAnchorMMChange', slot, axes, e.target.value)

        let temp = [...anchorMM]
        temp[axes] = parseFloat(e.target.value)
        setAnchorMM(temp)
    }
    const _onAnchorMMBlur = (e: any, slot: string, axes: number) => {
        console.log('_onAnchorPXChange', slot, axes, e.target.value)

        let temp = [...anchorMM]
        temp[axes] = parseFloat(e.target.value)
        setAnchorMM(temp)

        let converted = temp.map(v => Math.floor(v / 2))
        setAnchorPX(converted)
    }

    // --- ANCHOR CHANGES PX
    const _onAnchorPXChange = (e: any, slot: string, axes: number) => {
        console.log('_onAnchorPXChange', slot, axes, e.target.value)

        let temp = [...anchorPX]
        temp[axes] = parseFloat(e.target.value)
        setAnchorPX(temp)
    }
    const _onAnchorPXBlur =  (e: any, slot: string, axes: number) => {
        console.log('_onAnchorPXBlur', slot, axes)
        
        let temp = [...anchorPX]
        temp[axes] = parseFloat(e.target.value)
        setAnchorPX(temp)

        let converted = temp.map(v => v / 2)
        setAnchorMM(converted)
    }

    // --- ANCHOR UPDATE
    const _onClickAnchorSet = (e: any, slot: string) => {
        console.log('_onClickAnchorUpdate', slot, anchorMM, anchorPX)
    }

    // --- CONTOUR ACTIONS
    const _onClickContour = (e: any, slot: string, id: number) => {
        console.log('_onClickContour', slot, id)
    }
    const _onClickContourAnchor = (e: any, slot: string, id: number) => {
        console.log('_onClickContourAnchor', slot, id)
        e.stopPropagation()
    }
    const _onClickContourTarget = (e: any, slot: string, id: number) => {
        console.log('_onClickContourTarget', slot, id)
        e.stopPropagation()
    }
    const _onClickContourSelect = (e: any, slot: string, id: number) => {
        console.log('_onClickContourSelect', slot, id)
        e.stopPropagation()
    }
    const _onClickContourDMap = (e: any, slot: string, id: number) => {
        console.log('_onClickContourDMap', slot, id)
        e.stopPropagation()
    }

    return (
        <>
            <main className='info-card-body'>
                <dl className='info-meta'>
                    <dt>Modality</dt><dd className='info-mono'>{modality}</dd>
                    <dt>Shape</dt><dd className='info-mono'>{shape}</dd>
                    <dt>Spacing</dt><dd className='info-mono'>{spacing} mm</dd>
                </dl>
                <div className='info-anchor-container'>
                    <div className='info-anchor-row'>
                        <span className='info-anchor-label'>Anchor (mm)</span>
                        <div className='info-anchor-controls'>
                            {anchorMM.map((v: number, i: number) => <input
                                key={i}
                                className='info-anchor-input mono'
                                type='number'
                                onChange={(e) => _onAnchorMMChange(e, slot, i)}
                                onBlur={(e) => _onAnchorMMBlur(e, slot, i)}
                                value={v}
                            />)}
                        </div>
                    </div>
                    <div className='info-anchor-row'>
                        <span className='info-anchor-label'>Anchor (px)</span>
                        <div className='info-anchor-controls'>
                            {anchorPX.map((v: number, i: number) => <input
                                key={i}
                                className='info-anchor-input mono'
                                type='number'
                                onChange={(e) => _onAnchorPXChange(e, slot, i)}
                                onBlur={(e) => _onAnchorPXBlur(e, slot, i)}
                                value={v}
                            />)}
                        </div>
                    </div>
                    <button className='info-anchor-set' onClick={(e) => _onClickAnchorSet(e, slot)}>Set Anchor</button>
                </div>
                {state.hasContour && <span>Contours</span>}
                {!state.hasContour && <>
                    <button className='info-dcm-upload' onClick={(e) => _onClickStructUpload(e, slot)}>Load RTSTRUCT</button>
                    <input type='file' multiple accept='.dcm,application/dicom' style={{ display: 'none' }} onChange={(e) => _onStructUpload(e, slot)} />
                </>}
            </main>

            {!state.hasContour && <footer className='info-card-footer'>Load contours for more options.</footer>}
            {state.hasContour && <div className='info-contour-container'>
                {contours.map((c, id) => {
                    return <div key={id} className='info-contour-item' onClick={(e) => _onClickContour(e, slot, id)}>
                        <div className={`info-contour-label ${id % 7 ? 'info-contour-label-active' : ''}`}>
                            <div className='info-contour-badge'></div>
                            <span className='info-contour-name'>{c}</span>
                        </div>
                        <div className='info-contour-action-container'>
                            <button className='info-contour-action' onClick={(e) => _onClickContourAnchor(e, slot, id)}>
                                <img className='info-contour-action-img'src={Anchor} alt="A"/>
                            </button>
                            <button className='info-contour-action' onClick={(e) => _onClickContourTarget(e, slot, id)}>
                                <img className='info-contour-action-img'src={Target} alt="T"/>
                            </button>
                            <button className='info-contour-action' onClick={(e) => _onClickContourSelect(e, slot, id)}>
                                <img className='info-contour-action-img'src={Select} alt="S"/>
                            </button>
                            <button className='info-contour-action' onClick={(e) => _onClickContourDMap(e, slot, id)}>
                                <img className='info-contour-action-img'src={DMap} alt="D"/>
                            </button>
                        </div>
                    </div>
                })}
            </div>}
        </>
    )
}

const Card = ({slot}: {slot: string}) => {
    const state = useAppState()
    const ds = state.dataset[slot]

    console.log(slot, ds ? 1 : 0)

    // --- CLOSE
    const _onClickClose = (e: any, slot: string) => {
        console.log('_onClickClose', slot)
        state.deleteDicom(slot)
    }

    return (
        <section className={`info-card ${1 ? 'info-card-active' : ''}`}>
            <header className='info-card-header'>
                <span className='info-card-badge'>{slot}</span>
                <span className='info-card-name'>{1 ? `Dataset ${slot}` : 'Empty Slot'}</span>
                <span className='info-card-tag'>Active</span>
                <button className='info-card-close' onClick={(e) => _onClickClose(e, slot)}>
                   <img className='info-card-close-img' src={Close} alt='close' />
                </button>
            </header>
            {ds && <ContentLoaded slot={slot} />}
            {!ds && <ContentEmpty slot={slot} />}
        </section>
    )
}

const InfoPane = () => <nav className='info-pane'><Card slot='A' /><Card slot='B' /></nav>

export default InfoPane