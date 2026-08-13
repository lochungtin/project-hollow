import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { deleteDatasetAPI, getDeviceAPI, getDiVHAPI, rehydrateDatasetAPI, rehydrateResultsAPI, triggerGuavaOpAPI, updateAlignmentAPI, updateAnchorAPI, updateTargetAPI, updateVisibilityAPI, uploadDicomAPI, uploadRTStructAPI } from './api/client'
import { socket } from './api/websocket'
import { AppState, Dataset, Job, ResponseDiVHSingle, ResultStore } from './types'

// the anchor point always maps to world origin (see SceneManager.setDatasetTrans); alignment
// is where it's then placed, relative to that same world origin — so alignment IS the
// "anchor position relative to world origin" the MM/PX fields are meant to show and edit.
// mm is alignment as-is; px is mm divided by voxel spacing (spacing is mm per voxel).
const localAnchorFromAlignment = (alignment: number[], spacing: number[]) => ({
    mm: alignment.map((v: number) => Math.round(v)),
    px: alignment.map((v: number, i: number) => Math.round(v / spacing[i])),
})


const AppStateContext = createContext<AppState | null>(null)

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

	const [jobs, setJobs] = useState<Job[]>([])
	const [results, setResults] = useState<ResultStore>({'bsd': {}, 'disp': {}, 'sepd': {}, 'divh': [], 'sepdn': {}})

	const [divh, setDiVH] = useState<ResponseDiVHSingle>({ 'A': [], 'B': [] })

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


	// --- FILE UPLOAD
	const uploadDicom = useCallback(async (slot: string, files: File[] | FileList) => {
		setUploading((prev) => ({ ...prev, [slot]: true }))
		try {
			const ds: Dataset = await uploadDicomAPI(slot, files)

			const { mm, px } = localAnchorFromAlignment(ds.alignment, ds.scan.spacing)

			setDataset((prev) => ({ ...prev, [slot]: ds }))
			setLocalAnchorMM((prev) => ({ ...prev, [slot]: mm }))
			setLocalAnchorPX((prev) => ({ ...prev, [slot]: px }))

		} catch (err) {
			console.error(JSON.stringify(err))
		} finally {
			setUploading((prev) => ({ ...prev, [slot]: false }))
		}
	}, [])

	const uploadRTStruct = useCallback(async (slot: string, file: File) => {
		setUploading((prev) => ({ ...prev, [slot]: true }))
		try {
			const ds = await uploadRTStructAPI(slot, file)
			setDataset((prev) => ({ ...prev, [slot]: ds }))
		} catch (err) {
			console.error(JSON.stringify(err))
		} finally {
			setUploading((prev) => ({ ...prev, [slot]: false }))
		}
	}, [])

	const deleteDataset = useCallback(async (slot: string) => {
		try {
			await deleteDatasetAPI(slot)
			setDataset((prev) => ({ ...prev, [slot]: null }))
		} catch (err) {
			console.error(err)
		}
	}, [])

	// --- TOGGLE VISIBILITY
	const updateVisibility = useCallback(async (slot: string, type: string, visible: boolean, id?: string) => {
		try {
			const ds = await updateVisibilityAPI(slot, type, visible, id)
			setDataset((prev) => ({ ...prev, [slot]: ds }))
		} catch (err) {
			console.error(JSON.stringify(err))
		}
	}, [])

	// --- UPDATE ANCHOR
	const updateLocalAnchorMM = (slot: string, anchor: number[]) => {
		const ints = anchor.map(Math.round)
		setLocalAnchorMM((prev) => ({ ...prev, [slot]: ints }))
	}

	const updateLocalAnchorPX = (slot: string, anchor: number[]) => {
		const ints = anchor.map(Math.round)
		setLocalAnchorPX((prev) => ({ ...prev, [slot]: ints }))
	}

	// picks which point becomes the anchor (e.g. a contour's center of mass); the backend
	// resets alignment to zero when this happens, so that point lands exactly on world
	// origin — reflect that in the local MM/PX display too.
	const updateAnchor = useCallback(async (slot: string, anchor: number[], id: string = 'unknown') => {
		try {
			const ds = await updateAnchorAPI(slot, anchor, id)

			const { mm, px } = localAnchorFromAlignment(ds.alignment, ds.scan.spacing)

			setDataset((prev) => ({ ...prev, [slot]: ds }))
			setLocalAnchorMM((prev) => ({ ...prev, [slot]: mm }))
			setLocalAnchorPX((prev) => ({ ...prev, [slot]: px }))

		} catch (err) {
			console.error(JSON.stringify(err))
		}
	}, [])

	// manual translation of the dataset, relative to world origin
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

	// --- UPDATE TARGET
	const updateTarget = useCallback(async (slot: string, target: string) => {
		try {
			const ds = await updateTargetAPI(slot, target)
			setDataset((prev) => ({ ...prev, [slot]: ds }))
		} catch (err) {
			console.error(JSON.stringify(err))
		}
	}, [])

	// --- GUAVA OPERATIONS
	const trigger = useCallback(async (op: string) => {
		try {
			const job = await triggerGuavaOpAPI(op)
			setJobs((prev) => [job, ...prev])
		} catch (err) {
			console.error(JSON.stringify(err))
		}
	}, [])

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
		jobs, removeJob,
		trigger, results,
		getDiVH, divh
	])

	return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}