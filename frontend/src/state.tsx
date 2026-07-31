import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { deleteDatasetAPI, getDeviceAPI, updateVisibilityAPI, uploadDicomAPI, uploadRTStructAPI } from './api/client'


const AppStateContext = createContext<any>({})

export const useAppState = () =>  {
	const ctx = useContext(AppStateContext)
	if (!ctx)
		throw new Error('useAppState must be used within AppStateProvider')
	return ctx
}

export const AppStateProvider = ({ children }: { children: any })  => {
	const [device, setDevice] = useState("")

	const [dataset, setDataset] = useState({"A": null, "B": null})
	const [uploading, setUploading] = useState({"A": false, "B": false})


	useEffect(() => {
		getDeviceAPI().then(setDevice)
		return () => {}
	}, [])


	// --- FILE UPLOAD
	const uploadDicom = useCallback(async (slot: string, files: File[]) => {
		setUploading((prev) => ({...prev, [slot]: true}))
		try {
			const ds = await uploadDicomAPI(slot, files)
			setDataset((prev) => ({...prev, [slot]: ds}))
		} catch (err) {
			console.error(JSON.stringify(err))
		} finally {
			console.log("reset")
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
			setHaveContours((prev) => ({ ...prev, [slot]: false }))
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

	const value = useMemo(() => ({
		device,
		uploading,dataset,
		uploadDicom, uploadRTStruct, deleteDataset,
		updateVisibility
	}), [
		device,
		uploading,dataset,
		uploadDicom, uploadRTStruct, deleteDataset,
		updateVisibility
	])

	return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}