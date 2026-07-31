import { useRef, useState } from 'react'
import Anchor from '../../icons/anchor.svg'
import Close from '../../icons/close.svg'
import DMap from '../../icons/dmap.svg'
import Select from '../../icons/select.svg'
import Target from '../../icons/target.svg'
import { useAppState } from '../../state'
import './info.css'


const ContentEmpty = ({slot}: {slot: string}) => {
    const dicomUploadRef = useRef(null)

    const state = useAppState()

    // --- UPLOAD DICOM FILES
    const _onClickDcmUpload = (e: any, slot: string) => {
        console.log('_onDCMClickUpload', slot)
        if (state.uploading[slot])
            return
        if (dicomUploadRef.current)
            dicomUploadRef.current.click()
    }
    const _onDcmUpload = (e: any, slot: string) => {
        console.log('_onDCMUpload', slot, e.target.files.length)
        
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
    const structUploadRef = useRef(null)

    const state = useAppState()

    const ds = state.dataset[slot]
    const scan = ds.scan
    const contours = Object.values(ds.contours)

    const modality = scan.modality
    const shape = scan.shape.join(' x ')
    const spacing = scan.spacing.map((x: number) => x.toFixed(2)).join(' x ')

    const [anchorMM, setAnchorMM] = useState(ds.anchor.map((x: number) => x / scan.spacing[0]))
    const [anchorPX, setAnchorPX] = useState(ds.anchor)

    // --- UPLOAD RT STRUCT FILES
    const _onClickRTStructUpload = (e: any, slot: string) => {
        console.log('_onRTStructClickUpload', slot)
        if (state.uploading[slot])
            return
        if (structUploadRef.current)
            structUploadRef.current.click()
    }
    const _onRTStructUpload = (e: any, slot: string) => {
        console.log('_onRTStructUpload', slot, e.target.files.length)
        
        if (e.target.files && e.target.files.length == 1)
            state.uploadRTStruct(slot, e.target.files[0])
        e.target.value = ''
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

    const rgb2hex = (rgb: number[]) => `#${rgb.map(v => v.toString(16).padStart(2, "0")).join("")}`

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
                {contours.length != 0 && <span>Contours</span>}
                {contours.length == 0 && <>
                    <button className='info-dcm-upload' onClick={(e) => _onClickRTStructUpload(e, slot)}>
                        {state.uploading[slot] ? 'Uploading ...' : 'Load RTSTRUCT'}
                    </button>
                    <input 
                        ref={structUploadRef}
                        type='file'
                        accept='.dcm,application/dicom'
                        style={{ display: 'none' }}
                        onChange={(e) => _onRTStructUpload(e, slot)}
                    />
                </>}
            </main>

            {contours.length == 0 && <footer className='info-card-footer'>Load contours for more options.</footer>}
            {contours.length != 0 && <div className='info-contour-container'>
                {contours.map((c: any) => {
                    return <div key={c.id} className='info-contour-item' onClick={(e) => _onClickContour(e, slot, c.id)}>
                        <div className={`info-contour-label ${c.visible % 7 ? 'info-contour-label-active' : ''}`}>
                            <div className='info-contour-badge' style={{backgroundColor: rgb2hex(c.color)}}></div>
                            <span className='info-contour-name'>{c.name}</span>
                        </div>
                        <div className='info-contour-action-container'>
                            <button className='info-contour-action' onClick={(e) => _onClickContourAnchor(e, slot, c.id)}>
                                <img className='info-contour-action-img'src={Anchor} alt="A"/>
                            </button>
                            <button className='info-contour-action' onClick={(e) => _onClickContourTarget(e, slot, c.id)}>
                                <img className='info-contour-action-img'src={Target} alt="T"/>
                            </button>
                            <button className='info-contour-action' onClick={(e) => _onClickContourSelect(e, slot, c.id)}>
                                <img className='info-contour-action-img'src={Select} alt="S"/>
                            </button>
                            <button className='info-contour-action' onClick={(e) => _onClickContourDMap(e, slot, c.id)}>
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
    const visible = ds?.scan?.visible 

    // --- TOGGLE VISIBILITY
    const _onClickVisible = (e: any, slot: string) => {
        console.log('_onClickVisible', slot)
        if (ds)
            state.updateVisibility(slot, 'scan', !visible)
    }

    // --- CLOSE
    const _onClickClose = (e: any, slot: string) => {
        console.log('_onClickClose', slot)
        state.deleteDataset(slot)
    }

    return (
        <section className={`info-card ${1 ? 'info-card-active' : ''}`}>
            <header className='info-card-header'>
                <span className='info-card-badge'>{slot}</span>
                <span className='info-card-name'>{ds ? `Dataset ${slot}` : 'Empty Slot'}</span>
                <button className={`info-card-tag ${visible ? 'info-card-tag-active' : ''}`} onClick={(e) => _onClickVisible(e, slot)}>
                    <span className='info-card-tag-text'>{visible ? 'Enabled' : 'Disabled'}</span>
                </button>
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