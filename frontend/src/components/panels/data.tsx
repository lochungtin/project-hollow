import { LineChart } from '@mui/x-charts/LineChart'
import { useState } from 'react'
import ChevDown from '../../icons/chev-down.svg'
import ChevLeft from '../../icons/chev-left.svg'
import ChevRight from '../../icons/chev-right.svg'
import { useAppState } from '../../state'
import { Contour, ResponseSepD, ResponseSepDN } from '../../types'
import Switch from '../ui/Switch'
import './data.css'

const FALLBACK_TEXT = [
    'Upload contours to start analysing.',
    'Process requires both RTStructs to start.',
    'Process requries both target structures to be set.'
]

const parseContoursNumDiff = (
    A: { [key: string]: Contour },
    B: { [key: string]: Contour },
    field: 'volume' | 'surface_area',
    scaleA: number,
    scaleB: number,
    doScale: boolean
) => {
    scaleA = doScale ? scaleA : 1
    scaleB = doScale ? scaleB : 1

    const rt: { [key: string]: { [key: string]: any } } = {}

    Object.values(A).forEach(c => {
        const val = c[field] / scaleA
        if (!(c.name in rt))
            rt[c.name] = { 'A': val, 'B': '-', 'abs': '-', 'perc': '-' }
        else {
            rt[c.name]['A'] = val
            rt[c.name]['abs'] = rt[c.name]['B'] - val
            rt[c.name]['perc'] = rt[c.name]['abs'] / val * 100
        }
    })
    Object.values(B).forEach(c => {
        const val = c[field] / scaleB
        if (!(c.name in rt))
            rt[c.name] = { 'A': '-', 'B': val, 'abs': '-', 'perc': '-' }
        else {
            rt[c.name]['B'] = val
            rt[c.name]['abs'] = val - rt[c.name]['A']
            rt[c.name]['perc'] = rt[c.name]['abs'] / rt[c.name]['A'] * 100
        }
    })

    return {
        'rowNames': Object.keys(rt),
        'colNames': ['Dataset A', 'Dataset B', 'Abs Diff', '% Diff'],
        'data': Object.values(rt).map(grp => Object.values(grp))
    }
}

const Card = ({ badge, title, children }: { badge: string, title: string, children?: React.ReactNode }) => {
    const [showing, setShowing] = useState(true)

    return (
        <section className='data-card'>
            <header className='data-card-header'>
                <span className='data-card-badge mono'>{badge}</span>
                <span className='data-card-title'>{title}</span>
                <button className='data-card-chev' onClick={(e) => setShowing(!showing)}>
                    <img className='data-card-chev-img' src={showing ? ChevDown : ChevLeft} alt='toggle' />
                </button>
            </header>
            {showing && <div className='data-card-content'>{children}</div>}
        </section>
    )
}

const Fallback = ({ fallbackCode, fallbackMax, ready, fn, children }: {
    fallbackCode: number,
    fallbackMax: number,
    ready: boolean,
    fn?: () => void,
    children?: React.ReactElement | React.ReactElement[]
}) => {
    const onClick = (e: React.MouseEvent) => {
        if (fn)
            fn()
    }

    if (ready)
        return children
    return (<div className='data-card-fallback'>
        <div className='data-card-fallback-blur'>
            {fallbackCode < fallbackMax ?
                <div className='data-card-no-data'>{FALLBACK_TEXT[fallbackCode]}</div> :
                <button className='data-card-job-trigger' onClick={onClick}>Queue Job to Local Server</button>
            }
        </div>
    </div>)
}

const ColumnSelector = ({selection, selected, fn}: {selection: string[], selected: string, fn: (s: string) => void}) => {
    return (
        <aside className='data-card-selector-container'>
            {selection.map(s => {
                const cls = `data-card-selector-item ${selected === s? 'data-card-selector-item-selected': ''}`
                return <button key={s} className={cls} onClick={(e) => fn(s)}>
                    {s}
                </button>
            })}
        </aside>
    )
}

const Table = (
    { rowNames, colNames, data, scale, setScale, decorator = [] }:
        {
            rowNames: string[],
            colNames: string[],
            data: (number | string)[][],
            scale: boolean,
            setScale: (v: boolean) => void,
            decorator?: number[]
        }
) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setScale(e.target.checked)

    return (<table className='data-table'>
        <tbody>
            <tr className='data-table-row'>
                <th className='data-table-switch-cell'>
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

                    return <th key={j} className={`data-table-cell ${decor}`}>{_cell}</th>
                })}
            </tr></tbody>)
        })}
    </table>)
}

const Figure = ({A, B}: {A: number[], B: number[]}) => {   
    const cutA = A.findIndex((v) => v === 1)
    const cutB = B.findIndex((v) => v === 1)
    const cut = Math.ceil(Math.max(cutA, cutB) / 10) * 10
    console.log(cutA, cutB, cut)

    const _A = A.slice(0, cut)
    const _B = B.slice(0, cut)

    let x = []
    for (let i = 0; i < _A.length; ++i)
        x.push(-i)
    
    return <div className='data-card-figure-container'>
        <LineChart
            xAxis={[
                { data: x },
            ]}
            series={[
                { data: _A, color: '#9f79df' },
                { data: _B, color: '#3cef8e' },
            ]}
            slotProps={{
                legend: {
                    position: { vertical: 'bottom' },
                },
            }}
            height={200}
            width={375}
            sx={{
                '& .MuiChartsAxis-line': { stroke: '#555' },
                '& .MuiChartsAxis-tick': { stroke: '#555' },
                '& .MuiChartsAxis-tickLabel': { fill: '#efefef' },
                '& .MuiChartsAxis-label': { fill: '#efefef ' },
            }}
            margin={{
                top: 20,
                right: 20,
                bottom: 0,
                left: 0,
            }}
        />
        <div className="data-card-figure-legend">
            <div className="data-card-figure-legend-badge" style={{ backgroundColor: '#9f79df' }}/><span>Dataset A</span>
            <div style={{ width: 40 }}/>
            <div className="data-card-figure-legend-badge" style={{ backgroundColor: '#3cef8e' }}/><span>Dataset B</span>
        </div>
    </div>
}

const DataPane = () => {
    const [open, setOpen] = useState(true)

    const [scaleVol, setScaleVol] = useState(true)
    const [scaleSA, setScaleSA] = useState(true)
    const [scaleBSD, setScaleBSD] = useState(true)
    const [scaleDisp, setScaleDisp] = useState(true)
    const [scaleSepD, setScaleSepD] = useState(true)
    const [scaleSepDN, setScaleSepDN] = useState(true)
    
    const [selectedSepD, setSelectedSepD] = useState('')
    const [selectedDiVH, setSelectedDiVH] = useState('')
    const [selectedSepDN, setSelectedSepDN] = useState('')

    const state = useAppState()

    const _A = state.dataset['A']
    const _B = state.dataset['B']

    const A = _A?.contours ?? {}
    const B = _B?.contours ?? {}

    const emptyA = Object.keys(A).length !== 0
    const emptyB = Object.keys(B).length !== 0

    const aVolScale = Math.pow(_A?.scan.spacing[0] ?? 1, 3)
    const bVolScale = Math.pow(_B?.scan.spacing[0] ?? 1, 3)
    const aSAScale = Math.pow(_A?.scan.spacing[0] ?? 1, 2)
    const bSAScale = Math.pow(_B?.scan.spacing[0] ?? 1, 2)
    const unitScale = _A?.scan.spacing[0] ?? 1

    const targetsSet = ((_A && _A?.targetID !== 'unknown') && (_B && _B?.targetID !== 'unknown')) ?? false
    const displayStatus = +emptyA + +emptyB + +targetsSet

    const volData = parseContoursNumDiff(A, B, 'volume', aVolScale, bVolScale, scaleVol)
    const saData = parseContoursNumDiff(A, B, 'surface_area', aSAScale, bSAScale, scaleSA)

    const bsdData = Object.values(state.results.bsd).map(r => Object.values(r).map(v => v / (scaleBSD ? aSAScale : 1)))
    const dispData = Object.values(state.results.disp).map(r => r.map(v => v / (scaleDisp ? unitScale : 1)))

    const sepd = (state.results?.sepd as ResponseSepD)[selectedSepD] ?? []
    const sepdn = (state.results?.sepdn as ResponseSepDN)[selectedSepDN] ?? []

    const sepDData = sepd.map(r => r.map(v => v / (scaleSepD? unitScale : 1)))
    const sepDNData = sepdn.map(r => r.map(v => v / (scaleSepDN ? unitScale : 1)))

    // console.log(state.results.divh)
    console.log(state.divh)

    return (
        <aside className='data-pane-root'>
            <button className='data-pane-toggle' onClick={(e) => setOpen(!open)}>
                <img className={`data-pane-toggle-img ${open ? '' : 'data-pane-toggle-img-rotated'}`} src={ChevRight} alt='toggle' />
            </button>
            <main className={`data-pane ${open ? '' : 'data-pane-closed'}`}>
                <Card badge='VOL' title='Volume'>
                    <Fallback ready={volData.data.length > 0} fallbackCode={volData.data.length} fallbackMax={1}>
                        <Table {...volData} scale={scaleVol} setScale={setScaleVol} decorator={[2, 3]} />
                    </Fallback>
                </Card>
                <Card badge='SA' title='Surface Area'>
                    <Fallback ready={saData.data.length > 0} fallbackCode={saData.data.length} fallbackMax={1}>
                        <Table {...saData} scale={scaleSA} setScale={setScaleSA} decorator={[2, 3]} />
                    </Fallback>
                </Card>
                <Card badge='BSD' title='Bidirectional Surface Discrepancy'>
                    <Fallback ready={Object.keys(state.results.bsd).length > 0} fallbackCode={displayStatus} fallbackMax={2} fn={() => state.trigger('bsd')}>
                        <Table
                            rowNames={Object.keys(state.results.bsd)}
                            colNames={['ASD', 'HD95', 'HD']}
                            data={bsdData}
                            scale={scaleBSD}
                            setScale={setScaleBSD}
                        />
                    </Fallback>
                </Card>
                <Card badge='DISP' title='ROI Relative Displacement'>
                    <Fallback ready={Object.keys(state.results.disp).length > 0} fallbackCode={displayStatus} fallbackMax={2} fn={() => state.trigger('disp')}>
                        <Table
                            rowNames={Object.keys(state.results.disp)}
                            colNames={['AXIS 1', 'AXIS 2', 'AXIS 3']}
                            data={dispData}
                            scale={scaleDisp}
                            setScale={setScaleDisp}
                        />
                    </Fallback>
                </Card>
                <Card badge='SD' title='Separation Distance'>
                    <Fallback ready={Object.keys(state.results.sepd).length > 0} fallbackCode={displayStatus} fallbackMax={3} fn={() => state.trigger('sepd')}>
                        <ColumnSelector
                            selection={Object.keys(state.results.sepd)}
                            selected={selectedSepD}
                            fn={setSelectedSepD}
                        />
                        {selectedSepD ?
                            <Table
                                rowNames={['MIN', '5th', 'AVG', '95th', 'MAX']}
                                colNames={['Dataset A', 'Dataset B', 'Abs Diff']}
                                data={sepDData}
                                scale={scaleSepD}
                                setScale={setScaleSepD}
                            /> : 
                            <div className='data-card-fallback'>
                                <div className='data-card-fallback-blur'>
                                    Select a contour to display results.
                                </div>
                            </div>
                        }
                    </Fallback>
                </Card>
                <Card badge='DiVH' title='Distance Volume Histogram'>
                    <Fallback ready={state.results.divh.length > 0} fallbackCode={displayStatus} fallbackMax={3} fn={() => state.trigger('divh')}>
                        <ColumnSelector
                            selection={state.results.divh}
                            selected={selectedDiVH}
                            fn={s => {
                                setSelectedDiVH(s)
                                state.getDiVH(s)
                            }}
                        />
                        {selectedDiVH ?
                            <Figure A={state.divh['A']} B={state.divh['B']} /> : 
                            <div className='data-card-fallback'>
                                <div className='data-card-fallback-blur'>
                                    Select a contour to display results.
                                </div>
                            </div>
                        }
                    </Fallback>
                </Card>
                <Card badge='SD-N' title='Separation Distance - Nearside Surface'>
                    <Fallback ready={Object.keys(state.results.sepdn).length > 0} fallbackCode={displayStatus} fallbackMax={3} fn={() => state.trigger('sepdn')}>
                        <ColumnSelector
                            selection={Object.keys(state.results.sepdn)}
                            selected={selectedSepDN}
                            fn={setSelectedSepDN}
                        />
                        {selectedSepDN ?
                            <Table
                                rowNames={['MIN', '5th', 'AVG', '95th', 'MAX']}
                                colNames={['Dataset A', 'Dataset B', 'Abs Diff']}
                                data={sepDNData}
                                scale={scaleSepDN}
                                setScale={setScaleSepDN}
                            /> : 
                            <div className='data-card-fallback'>
                                <div className='data-card-fallback-blur'>
                                    Select a contour to display results.
                                </div>
                            </div>
                        }
                    </Fallback>
                </Card>
            </main>
        </aside>
    )
}

export default DataPane

