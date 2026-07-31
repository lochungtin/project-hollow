import { useState } from 'react'
import ChevDown from '../../icons/chev-down.svg'
import ChevLeft from '../../icons/chev-left.svg'
import ChevRight from '../../icons/chev-right.svg'
import { useAppState } from '../../state'
import './data.css'


const contours = ['Body', 'Breast_L', 'Breast_R', 'Esophagus', 'Heart', 'Lung_L', 'Lung_R', 'Spinal_Canal']

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

const Table = ({rowNames, colNames, data, decorator = []}: {rowNames: string[], colNames: string[], data: any[][], decorator?: number[]}) => {
    return (<table className='data-table'>
        <tr className='data-table-row'>
            <th></th>
            {colNames.map((n, i) => <th key={i} className='data-table-col-label'>{n}</th>)}
        </tr>
        {data.map((row, i) => {
            return (<tr key={i} className='data-table-row'>
                <th className='data-table-row-label'>{rowNames[i]}</th>
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
            </tr>)
        })}
    </table>)
}

const Figure = () => {

}

const rowNames = ['Body', 'Breast_L', 'Breast_R', 'Esophagus', 'Heart', 'Lung_L', 'Lung_R', 'Spinal_Canal']
const colNames = ['Dataset A', 'Dataset B', 'Abs Diff', '% Diff']
const data = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, '-'], [0, 0, 1, -1], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]

const parseContoursNumDiff = (A: any, B: any, field: string, scaling: number = 1) => {
    const rt: any = {}
    
    Object.values(A).forEach((c: any) => {
        if (!(c.name in rt))
            rt[c.name] = {'A': c[field] / scaling, 'B': '-', 'abs': '-', 'perc': '-'}
    })
    Object.values(B).forEach((c: any) => {
        if (!(c.name in rt))
            rt[c.name] = {'A': '-', 'B': '-', 'abs': '-', 'perc': '-'}
        else {
            rt[c.name]['B'] = c[field] / scaling
            rt[c.name]['abs'] = rt[c.name]['B'] - rt[c.name]['A']
            rt[c.name]['perc'] = rt[c.name]['abs'] / rt[c.name]['A'] * 100
        }
            
    })
    return {
        'rowNames': Object.keys(rt),
        'colNames': ['Dataset A', 'Dataset B', 'Abs Diff', '% Diff'],
        'data': Object.values(rt).map((grp: any) => Object.values(grp))
    }
}

const DataPane = () => {
    const [open, setOpen] = useState(true)

    const state = useAppState()

    const A = state.dataset["A"] ? state.dataset["A"].contours : {}
    const B = state.dataset["B"] ? state.dataset["B"].contours : {}

    const volData = parseContoursNumDiff(A, B, 'volume', 8)
    const saData = parseContoursNumDiff(A, B, 'surface_area', 4)

    return (
        <aside className='data-pane-root'>
            <button className='data-pane-toggle' onClick={(e) => setOpen(!open)}>
                <img className={`data-pane-toggle-img ${open ? '' : 'data-pane-toggle-img-rotated'}`} src={ChevRight} alt='toggle' />
            </button>
            <main className={`data-pane ${open ? '' : 'data-pane-closed'}`}>
                <Card badge='VOL' title='Volume'>
                    <Table {...volData} decorator={[2, 3]}/>
                </Card>
                <Card badge='SA' title='Surface Area'>
                    <Table {...saData} decorator={[2, 3]}/>
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
