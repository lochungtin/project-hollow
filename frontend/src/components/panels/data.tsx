import { useState } from 'react'
import ChevDown from '../../icons/chev-down.svg'
import ChevLeft from '../../icons/chev-left.svg'
import ChevRight from '../../icons/chev-right.svg'
import { useAppState } from '../../state'
import { rgb2hex } from '../ui/color'
import Switch from '../ui/Switch'
import './data.css'


const Card = ({badge, title, children} : {badge: string, title: string, children?: React.ReactNode}) => {
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
            {showing && children}
        </section>
    )
}

const Table = (
    {rowNames, colNames, data, colors, scale, setScale, decorator = []}: 
    {   rowNames: string[], 
        colNames: string[],
        data: any[][],
        colors: number[][], 
        scale: boolean,
        setScale: any,
        decorator?: number[]
    }
) => {
    const handleChange = (e: any) => setScale(e.target.checked)

    return (<table className='data-table'>
        <tbody>
            <tr className='data-table-row'>
                <th>
                    <span className={scale ? '' : 'data-table-switch-active'}>px</span> 
                    <Switch 
                        slotProps={{ input: { 'aria-label': 'controlled' } }} 
                        checked={scale}
                        onChange={handleChange}
                        size='small' 
                        className='data-table-switch'
                    />
                    <span className={scale ? 'data-table-switch-active' : ''}>mm</span>
                </th>
                {colNames.map((n, i) => <th key={i} className='data-table-col-label'>{n}</th>)}
            </tr>
        </tbody>
        {data.map((row, i) => {
            return (<tbody key={i}><tr className='data-table-row'>
                <th className='data-table-row-label'>
                    <div className='data-table-row-label-badge' style={{backgroundColor: rgb2hex(colors[i])}}></div>
                    <span>{rowNames[i]}</span>
                </th>
                {row.map((cell, j) => {
                    let _cell = cell
                    let decor = ''

                    if (typeof cell === 'number') {
                        _cell = Math.round(cell * 100) / 100
                        if (decorator.includes(j)) {
                            if (_cell > 0)
                                decor = 'data-table-text-pos'
                            if (_cell < 0)
                                decor = 'data-table-text-neg'
                        }
                        _cell = _cell.toFixed(2)
                    }

                    return <th key={j} className={`data-table-cell ${decor}`}>
                        {_cell}
                    </th>
                })}
            </tr></tbody>)
        })}
    </table>)
}

const Figure = () => {

}


const parseContoursNumDiff = (
    A: any,
    B: any, 
    field: string,
    scaleA: number,
    scaleB: number,
    doScale: boolean
) => {
    scaleA = doScale ? scaleA : 1
    scaleB = doScale ? scaleB : 1

    const rt: any = {}
    const colors: number[][] = []
    
    Object.values(A).forEach((c: any) => {
        rt[c.name] = {'A': c[field] / scaleA, 'B': '-', 'abs': '-', 'perc': '-'}
        colors.push(c.color)
    })
    Object.values(B).forEach((c: any) => {
        if (!(c.name in rt))
            rt[c.name] = {'A': '-', 'B': '-', 'abs': '-', 'perc': '-'}
        else {
            rt[c.name]['B'] = c[field] / scaleB
            rt[c.name]['abs'] = rt[c.name]['B'] - rt[c.name]['A']
            rt[c.name]['perc'] = rt[c.name]['abs'] / rt[c.name]['A'] * 100
            colors.push(c.color)
        }
            
    })
    return {
        'colors': colors,
        'rowNames': Object.keys(rt),
        'colNames': ['Dataset A', 'Dataset B', 'Abs Diff', '% Diff'],
        'data': Object.values(rt).map((grp: any) => Object.values(grp))
    }
}

const Fallback = () => <div className='data-card-no-data'><span>Upload contours to start analysing</span></div>

const DataPane = () => {
    const [open, setOpen] = useState(true)

    const [scaleVol, setScaleVol] = useState(true)
    const [scaleSA, setScaleSA] = useState(true)

    const state = useAppState()

    const _A = state.dataset["A"] 
    const _B = state.dataset["B"] 

    const A = _A?.contours ?? {}
    const B = _B?.contours ?? {}

    const aVolScale = Math.pow(_A?.scan.spacing[0] ?? 1, 3)
    const bVolScale = Math.pow(_B?.scan.spacing[0] ?? 1, 3)
    const aSAScale = Math.pow(_A?.scan.spacing[0] ?? 1, 2)
    const bSAScale = Math.pow(_B?.scan.spacing[0] ?? 1, 2)

    const volData = parseContoursNumDiff(A, B, 'volume', aVolScale, bVolScale, scaleVol)
    const saData = parseContoursNumDiff(A, B, 'surface_area', aSAScale, bSAScale, scaleSA)

    return (
        <aside className='data-pane-root'>
            <button className='data-pane-toggle' onClick={(e) => setOpen(!open)}>
                <img className={`data-pane-toggle-img ${open ? '' : 'data-pane-toggle-img-rotated'}`} src={ChevRight} alt='toggle' />
            </button>
            <main className={`data-pane ${open ? '' : 'data-pane-closed'}`}>
                <Card badge='VOL' title='Volume'>
                    {volData.data.length > 0 ?
                        <Table {...volData} scale={scaleVol} setScale={setScaleVol} decorator={[2, 3]}/> :
                        <Fallback />
                    }
                </Card>
                <Card badge='SA' title='Surface Area'>
                    {saData.data.length > 0 ?
                        <Table {...saData} scale={scaleSA} setScale={setScaleSA} decorator={[2, 3]}/> :
                        <Fallback />
                    }
                </Card>
                <Card badge='BSD' title='Bidirectional Surface Discrepancy'>
                </Card>
                <Card badge='DISP' title='ROI Relative Displacement'></Card>
                <Card badge='SD' title='Separation Distance'></Card>
                <Card badge='DiVH' title='Distance Volume Histogram'></Card>
                <Card badge='SD-N' title='Separation Distance - Nearside Surface'></Card>
            </main>
        </aside>
    )
}

export default DataPane

