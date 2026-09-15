import { Axis } from '../../types'
import './view2d.css'


/** One grid cell's display data: the base scan slice (or `null` for an out-of-range/hidden placeholder) plus any composited contour overlays. */
export type SliceImg = {
    'axis': Axis,
    'url': string | null,
    'idx': number,       // anchor-relative offset along this axis (0 = the dataset's anchor slice; can be negative)
    'arrayIdx': number,  // absolute 0-based index into the scan's own array that idx currently resolves to
    'dim': number,        // total slice count along this axis (scan.shape[axis])
    'overlays': string[],
}

/**
 * One dataset's three cardinal-axis slices, cached independently per axis (not by
 * focus/small-pane role) so that switching which axis is the focus pane is a pure
 * re-layout — it never needs to refetch an axis whose own slice index hasn't changed.
 * An axis is `undefined` until its first fetch resolves (e.g. briefly after entering
 * 2D mode).
 */
export type AxisGrid = Partial<Record<Axis, SliceImg>>

const CARDINAL_AXES: Axis[] = ['axial', 'coronal', 'sagittal']
const AXIS_LABEL: Record<Axis, string> = { 'axial': 'AXIAL', 'coronal': 'CORONAL', 'sagittal': 'SAGITTAL' }

/**
 * Axes whose row-axis vertical orientation needs flipping when shown as a plain, unrotated
 * `<img>`. The backend's slice PNGs are laid out for the 3D pipeline, where Three.js's default
 * texture Y-flip combines with `AXIS_DV` (scan.ts) to land right-side-up on the 3D plane; a flat
 * `<img>` bypasses that flip entirely, so axes whose `AXIS_DV` differs from axial's need an
 * explicit counter-flip here to still read correctly top-to-bottom.
 */
const AXIS_FLIP: Record<Axis, boolean> = { 'axial': false, 'coronal': true, 'sagittal': true }

/** Renders one grid cell: the scan image, any contour overlays stacked on top (flipped together, upright), and (for focus panes) a floating slice-index label. Blank until its axis's first fetch resolves. */
const Cell = ({ img, axis, focus }: { img: SliceImg | undefined, axis: Axis, focus: boolean }) => (
    <div className={focus ? 'view-2d-cell view-2d-cell-focus' : 'view-2d-cell'}>
        {img && (
            <div className={AXIS_FLIP[axis] ? 'view-2d-imgstack view-2d-flip' : 'view-2d-imgstack'}>
                {img.url && <img src={img.url} alt='' />}
                {img.overlays.map((url, i) => <img key={i} src={url} className='view-2d-overlay' alt='' />)}
            </div>
        )}
        {focus && img && (
            <div className='view-2d-label mono'>
                {AXIS_LABEL[axis]} &middot; {img.idx === 0 ? 'ANCHOR' : (img.idx > 0 ? `+${img.idx}` : img.idx)} ({img.arrayIdx + 1}/{img.dim})
            </div>
        )}
    </div>
)

/** Renders one dataset's column: the big focus pane on top, its two other cardinal axes as small panes underneath. */
const Half = ({ grid, focusAxis }: { grid: AxisGrid, focusAxis: Axis }) => {
    const others = CARDINAL_AXES.filter(axis => axis !== focusAxis)
    return (
        <div className='view-2d-half'>
            <Cell img={grid[focusAxis]} axis={focusAxis} focus />
            <div className='view-2d-small-row'>
                <Cell img={grid[others[0]]} axis={others[0]} focus={false} />
                <Cell img={grid[others[1]]} axis={others[1]} focus={false} />
            </div>
        </div>
    )
}

/**
 * 2D grid viewport: up to two side-by-side columns (dataset A left, B right), each showing its
 * currently-focused cardinal axis as a large pane above its other two axes as small panes.
 * Purely presentational — all slice/contour fetching and keybinding logic lives in `view.tsx`.
 */
const View2DGrid = ({ grids, focusAxis }: { grids: Record<string, AxisGrid | null>, focusAxis: Axis }) => {
    const slots = (['A', 'B'] as const).filter(s => grids[s])

    if (slots.length === 0)
        return <div className='view-2d-grid view-2d-empty mono'>No dataset loaded</div>

    return (
        <div className='view-2d-grid'>
            {slots.map(s => <Half key={s} grid={grids[s] as AxisGrid} focusAxis={focusAxis} />)}
        </div>
    )
}

export default View2DGrid
