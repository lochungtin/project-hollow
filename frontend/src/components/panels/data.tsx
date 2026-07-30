import { useState } from 'react'
import ChevDown from '../../icons/chev-down.svg'
import ChevLeft from '../../icons/chev-left.svg'
import ChevRight from '../../icons/chev-right.svg'
import './data.css'


const contours = ['Body', 'Breast_L', 'Breast_R', 'Esophagus', 'Heart', 'Lung_L', 'Lung_R', 'Spinal_Canal']

const Card = ({badge, title} : {badge: string, title: string}) => {
    const [showing, setShowing] = useState(true)
    
    return (
        <section className='data-card'>
            <header className='data-card-header'>
                <span className='data-card-badge mono'>{badge}</span>
                <span className='data-card-title'>{title}</span>
                <button className='data-card-chev' onClick={(e) => setShowing(!showing)}>
                    <img className='data-card-chev-img' src={showing ? ChevDown : ChevLeft} alt="toggle" />
                </button>
            </header>
        </section>
    )
}

const Table = () => {

}

const Figure = () => {

}

const DataPane = () => {
    const [open, setOpen] = useState(false)

    return (
        <aside className='data-pane-root'>
            <button className='data-pane-toggle' onClick={(e) => setOpen(!open)}>
                <img className={`data-pane-toggle-img ${open ? '' : 'data-pane-toggle-img-rotated'}`} src={ChevRight} alt='toggle' />
            </button>
            <main className={`data-pane ${open ? '' : 'data-pane-closed'}`}>
                <Card badge='VOL' title='Volume' />
                <Card badge='SA' title='Surface Area' />
                <Card badge='BSD' title='Bidirectional Surface Discrepancy' />
                <Card badge='DISP' title='ROI Relative Displacement' />
                <Card badge='SD' title='Separation Distance' />
                <Card badge='DiVH' title='Distance Volume Histogram' />
                <Card badge='SD-N' title='Separation Distance - Nearside Surface' />
            </main>
        </aside>
    )
}

export default DataPane