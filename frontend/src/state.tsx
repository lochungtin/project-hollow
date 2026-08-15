import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { deleteDatasetAPI, getDeviceAPI, getDiVHAPI, rehydrateDatasetAPI, rehydrateResultsAPI, triggerGuavaOpAPI, updateAlignmentAPI, updateAnchorAPI, updateTargetAPI, updateVisibilityAPI, uploadDicomAPI, uploadRTStructAPI } from './api/client'
import { socket } from './api/websocket'
import { AppState, Dataset, Job, ResponseDiVHSingle, ResultStore, SelectedContour } from './types'

/** Derives the anchor MM/PX display fields from a dataset's alignment and voxel spacing. */
const localAnchorFromAlignment = (alignment: number[], spacing: number[]) => ({
    mm: alignment.map((v: number) => Math.round(v)),
    px: alignment.map((v: number, i: number) => Math.round(v / spacing[i])),
})

/** Returns an empty GUAVA result store, matching the server's post-invalidation shape. */
const emptyResults = (): ResultStore => ({ bsd: {}, disp: {}, sepd: {}, divh: [], sepdn: {} })


const AppStateContext = createContext<AppState | null>(null)

/** Accesses the global app state; must be called within an `AppStateProvider`. */
export const useAppState = () => {
	const ctx = useContext(AppStateContext)
	if (!ctx)
		throw new Error('useAppState must be used within AppStateProvider')
	return ctx
}

export const AppStateProvider = ({ children }: { children: React.ReactNode }) => {
	const [device, setDevice] = useState('Loading...')

	const [activeSlot, setActiveSlot] = useState('A')
	const [dataset, setDataset] = useState({ 'A': null, 'B': null })
	const [uploading, setUploading] = useState({ 'A': false, 'B': false })

	const [localAnchorMM, setLocalAnchorMM] = useState({ 'A': [0, 0, 0], 'B': [0, 0, 0] })
	const [localAnchorPX, setLocalAnchorPX] = useState({ 'A': [0, 0, 0], 'B': [0, 0, 0] })

	const [selected, setSelected] = useState<SelectedContour[]>([])

	const [dmapContours, setDMapContours] = useState<SelectedContour[]>([])

	const [jobs, setJobs] = useState<Job[]>([])
	const [results, setResults] = useState<ResultStore>({'bsd': {}, 'disp': {}, 'sepd': {}, 'divh': [], 'sepdn': {}})

	const [divh, setDiVH] = useState<ResponseDiVHSingle>({ 'A': [], 'B': [] })

	/** Reloads both slots' datasets and the cached GUAVA result store from the server. */
	const rehydrate = useCallback(async () => {
		try {
			const datasets = await rehydrateDatasetAPI()
			const results = await rehydrateResultsAPI()

			setResults(results)

			Object.entries(datasets).forEach(([slot, ds]) => {
				if (ds) {
					const { mm, px } = localAnchorFromAlignment(ds.alignment, ds.scan.spacing)

					setDataset((prev) => ({ ...prev, [slot]: ds }))
					setLocalAnchorMM((prev) => ({ ...prev, [slot]: mm }))
					setLocalAnchorPX((prev) => ({ ...prev, [slot]: px }))
				}
			})
		} catch {
			setDataset({ 'A': null, 'B': null })
			setLocalAnchorMM({ 'A': [0, 0, 0], 'B': [0, 0, 0] })
			setLocalAnchorPX({ 'A': [0, 0, 0], 'B': [0, 0, 0] })
		}
	}, [])


	useEffect(() => {
		getDeviceAPI().then(setDevice)
		rehydrate()

		socket.connect()
		const unsub = socket.subscribe(msg => {
			if (msg.type === 'list')
				setJobs(msg.jobs)
			if (msg.type === 'update') {
				console.log(`Job update: ${msg.job.name} [${msg.job.status}]`)
				setJobs((prev) => {
					const idx = prev.findIndex((j) => j.id === msg.job.id)
					if (idx === -1)
						return [msg.job, ...prev]
					const copy = [...prev]
					copy[idx] = msg.job
					return copy
				})

				if (msg.job.status === 'complete')
					setResults((prev) => ({...prev, [msg.job.type]: msg.job.result}))
			}
		})
		return () => {
			socket.close()
			unsub()
		}
	}, [])


	/** Uploads a DICOM series into a slot and replaces that slot's local dataset state. */
	const uploadDicom = useCallback(async (slot: string, files: File[] | FileList) => {
		setUploading((prev) => ({ ...prev, [slot]: true }))
		try {
			const ds: Dataset = await uploadDicomAPI(slot, files)

			const { mm, px } = localAnchorFromAlignment(ds.alignment, ds.scan.spacing)

			setDataset((prev) => ({ ...prev, [slot]: ds }))
			setLocalAnchorMM((prev) => ({ ...prev, [slot]: mm }))
			setLocalAnchorPX((prev) => ({ ...prev, [slot]: px }))
			setResults(emptyResults())

		} catch (err) {
			console.error(JSON.stringify(err))
		} finally {
			setUploading((prev) => ({ ...prev, [slot]: false }))
		}
	}, [])

	/** Uploads an RTSTRUCT file into a slot and replaces that slot's local dataset state. */
	const uploadRTStruct = useCallback(async (slot: string, file: File) => {
		setUploading((prev) => ({ ...prev, [slot]: true }))
		try {
			const ds = await uploadRTStructAPI(slot, file)
			setDataset((prev) => ({ ...prev, [slot]: ds }))
			setResults(emptyResults())
		} catch (err) {
			console.error(JSON.stringify(err))
		} finally {
			setUploading((prev) => ({ ...prev, [slot]: false }))
		}
	}, [])

	/** Deletes a slot's dataset and clears the cached GUAVA results. */
	const deleteDataset = useCallback(async (slot: string) => {
		try {
			await deleteDatasetAPI(slot)
			setDataset((prev) => ({ ...prev, [slot]: null }))
			setResults(emptyResults())
		} catch (err) {
			console.error(err)
		}
	}, [])

	/** Toggles visibility of a scan or a single contour in a slot. */
	const updateVisibility = useCallback(async (slot: string, type: string, visible: boolean, id?: string) => {
		try {
			const ds = await updateVisibilityAPI(slot, type, visible, id)
			setDataset((prev) => ({ ...prev, [slot]: ds }))
		} catch (err) {
			console.error(JSON.stringify(err))
		}
	}, [])

	/** Updates a slot's locally-displayed anchor MM field. */
	const updateLocalAnchorMM = (slot: string, anchor: number[]) => {
		const ints = anchor.map(Math.round)
		setLocalAnchorMM((prev) => ({ ...prev, [slot]: ints }))
	}

	/** Updates a slot's locally-displayed anchor PX field. */
	const updateLocalAnchorPX = (slot: string, anchor: number[]) => {
		const ints = anchor.map(Math.round)
		setLocalAnchorPX((prev) => ({ ...prev, [slot]: ints }))
	}

	/** Sets a slot's anchor point and clears the now-stale displacement result. */
	const updateAnchor = useCallback(async (slot: string, anchor: number[], id: string = 'unknown') => {
		try {
			const ds = await updateAnchorAPI(slot, anchor, id)

			const { mm, px } = localAnchorFromAlignment(ds.alignment, ds.scan.spacing)

			setDataset((prev) => ({ ...prev, [slot]: ds }))
			setLocalAnchorMM((prev) => ({ ...prev, [slot]: mm }))
			setLocalAnchorPX((prev) => ({ ...prev, [slot]: px }))
			setResults((prev) => ({ ...prev, disp: {} }))

		} catch (err) {
			console.error(JSON.stringify(err))
		}
	}, [])

	/** Manually translates a slot's dataset relative to world origin. */
	const updateAlignment = useCallback(async (slot: string, alignment: number[]) => {
		try {
			const ds = await updateAlignmentAPI(slot, alignment)

			const { mm, px } = localAnchorFromAlignment(ds.alignment, ds.scan.spacing)

			setDataset((prev) => ({ ...prev, [slot]: ds }))
			setLocalAnchorMM((prev) => ({ ...prev, [slot]: mm }))
			setLocalAnchorPX((prev) => ({ ...prev, [slot]: px }))

		} catch (err) {
			console.error(JSON.stringify(err))
		}
	}, [])

	/** Sets a slot's GUAVA target contour, clears now-stale results, and drops it out of DMap mode. */
	const updateTarget = useCallback(async (slot: string, target: string) => {
		try {
			const ds = await updateTargetAPI(slot, target)
			setDataset((prev) => ({ ...prev, [slot]: ds }))
			setResults((prev) => ({ ...prev, divh: [], sepd: {}, sepdn: {} }))

			setDMapContours((prev) => prev.filter((s) => !(s.slot === slot && s.id === target)))
		} catch (err) {
			console.error(JSON.stringify(err))
		}
	}, [])

	/** Toggles a contour in/out of the arbitrary-axis selection, capped at two entries. */
	const toggleContourSelect = useCallback((slot: string, id: string) => {
		setSelected((prev) => {
			const idx = prev.findIndex((s) => s.slot === slot && s.id === id)
			if (idx !== -1) {
				const copy = [...prev]
				copy.splice(idx, 1)
				return copy
			}
			if (prev.length >= 2)
				return prev
			return [...prev, { slot, id }]
		})
	}, [])

	/** Toggles a contour in/out of distance-map rendering mode. */
	const toggleContourDMap = useCallback((slot: string, id: string) => {
		setDMapContours((prev) => {
			const idx = prev.findIndex((s) => s.slot === slot && s.id === id)
			if (idx !== -1) {
				const copy = [...prev]
				copy.splice(idx, 1)
				return copy
			}
			return [...prev, { slot, id }]
		})
	}, [])

	/** Queues a named GUAVA operation as a background job. */
	const trigger = useCallback(async (op: string) => {
		try {
			const job = await triggerGuavaOpAPI(op)
			setJobs((prev) => [job, ...prev])
		} catch (err) {
			console.error(JSON.stringify(err))
		}
	}, [])

	/** Removes a job from the local job list (e.g. once its toast is dismissed). */
	const removeJob = (job: Job) => {
		setJobs((prev) => {
			const idx = prev.findIndex((j) => j.id === job.id)
			if (idx === -1)
				return [...prev]
			const copy = [...prev]
			copy.splice(idx, 1)
			return copy
		})
	}

	/** Fetches a single ROI's DiVH result into local state. */
	const getDiVH = useCallback(async (roi: string) => {
		try {
			const res = await getDiVHAPI(roi)
			setDiVH(res)
		} catch (err) {
			console.error(JSON.stringify(err))
		}
	}, [])


	const value = useMemo(() => ({
		device,
		activeSlot, setActiveSlot,
		uploading, dataset,
		uploadDicom, uploadRTStruct, deleteDataset,
		updateVisibility,
		updateLocalAnchorMM, updateLocalAnchorPX,
		updateAnchor, updateAlignment, localAnchorMM, localAnchorPX,
		updateTarget,
		selected, toggleContourSelect,
		dmapContours, toggleContourDMap,
		jobs, removeJob,
		trigger, results,
		getDiVH, divh
	}), [
		device,
		activeSlot, setActiveSlot,
		uploading, dataset,
		uploadDicom, uploadRTStruct, deleteDataset,
		updateVisibility,
		updateLocalAnchorMM, updateLocalAnchorPX,
		updateAnchor, updateAlignment, localAnchorMM, localAnchorPX,
		updateTarget,
		selected, toggleContourSelect,
		dmapContours, toggleContourDMap,
		jobs, removeJob,
		trigger, results,
		getDiVH, divh
	])

	return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
