import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { deleteDatasetAPI, getDeviceAPI, triggerBSDAPI, updateAnchorAPI, updateTargetAPI, updateVisibilityAPI, uploadDicomAPI, uploadRTStructAPI } from './api/client'


const AppStateContext = createContext<any>({})

export const useAppState = () =>  {
	const ctx = useContext(AppStateContext)
	if (!ctx)
		throw new Error('useAppState must be used within AppStateProvider')
	return ctx
}

export const AppStateProvider = ({ children }: { children: any })  => {
	const [device, setDevice] = useState("Loading...")

	const [dataset, setDataset] = useState({"A": null, "B": null})
	const [uploading, setUploading] = useState({"A": false, "B": false})

	const [localAnchorMM, setLocalAnchorMM] = useState({"A": [0, 0, 0], "B": [0, 0, 0]})
    const [localAnchorPX, setLocalAnchorPX] = useState({"A": [0, 0, 0], "B": [0, 0, 0]})


	useEffect(() => {
		getDeviceAPI().then(setDevice)
		return () => {}
	}, [])


	// --- FILE UPLOAD
	const uploadDicom = useCallback(async (slot: string, files: File[]) => {
		setUploading((prev) => ({...prev, [slot]: true}))
		try {
			const ds = await uploadDicomAPI(slot, files)

			const lAnchorMM = ds.anchor.map((x: number) => Math.round(x / ds.scan.spacing[0]))
			const lAnchorPX = ds.anchor

			setDataset((prev) => ({...prev, [slot]: ds}))
			setLocalAnchorMM((prev) => ({...prev, [slot]: lAnchorMM}))
			setLocalAnchorPX((prev) => ({...prev, [slot]: lAnchorPX}))
			
		} catch (err) {
			console.error(JSON.stringify(err))
		} finally {
			setUploading((prev) => ({...prev, [slot]: false}))
		}
	}, [])

	const uploadRTStruct = useCallback(async (slot: string, file: File) => {
		setUploading((prev) => ({...prev, [slot]: true}))
		try {
			const ds = await uploadRTStructAPI(slot, file)
			setDataset((prev) => ({...prev, [slot]: ds}))
		} catch (err) {
			console.error(JSON.stringify(err))
		} finally {
			setUploading((prev) => ({...prev, [slot]: false}))
		}
	}, []) 

	const deleteDataset = useCallback(async (slot: string)=> {
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
			setDataset((prev) => ({...prev, [slot]: ds}))
		} catch (err) {
			console.error(JSON.stringify(err))
		}
	}, [])

	// --- UPDATE ANCHOR
	const updateLocalAnchorMM = (slot: string, anchor: number[]) => {
		const ints = anchor.map(Math.round)
		setLocalAnchorMM((prev) => ({...prev, [slot]: ints}))
	}

	const updateLocalAnchorPX = (slot: string, anchor: number[]) => {
		const ints = anchor.map(Math.round)
		setLocalAnchorPX((prev) => ({...prev, [slot]: ints}))
	}

	const updateAnchor = useCallback(async (slot: string, anchor: number[], id: string = "unknown") => {
		try {
			const ds = await updateAnchorAPI(slot, anchor, id)

			const lAnchorMM = ds.anchor.map((x: number) => Math.round(x / ds.scan.spacing[0]))
			const lAnchorPX = ds.anchor

			setDataset((prev) => ({...prev, [slot]: ds}))
			setLocalAnchorMM((prev) => ({...prev, [slot]: lAnchorMM}))
			setLocalAnchorPX((prev) => ({...prev, [slot]: lAnchorPX}))

		} catch (err) {
			console.error(JSON.stringify(err))
		}
	}, [])

	// --- UPDATE TARGET
	const updateTarget = useCallback(async (slot: string, target:string) => {
		try {
			const ds = await updateTargetAPI(slot, target)
			setDataset((prev) => ({...prev, [slot]: ds}))
		} catch (err) {
			console.error(JSON.stringify(err))
		}
	}, [])

	// --- GUAVA OPERATIONS
	const triggerBSD = useCallback(async () => {
		try {
			const res = await triggerBSDAPI()
			console.log(res)
		} catch (err) {
			console.error(JSON.stringify(err))
		}
	}, [])


	const value = useMemo(() => ({
		device,
		uploading,dataset,
		uploadDicom, uploadRTStruct, deleteDataset,
		updateVisibility,
		updateAnchor, localAnchorMM, updateLocalAnchorMM, localAnchorPX, updateLocalAnchorPX,
		updateTarget,
	}), [
		device,
		uploading,dataset,
		uploadDicom, uploadRTStruct, deleteDataset,
		updateVisibility,
		updateAnchor, localAnchorMM, updateLocalAnchorMM, localAnchorPX, updateLocalAnchorPX,
		updateTarget,
	])

	return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}