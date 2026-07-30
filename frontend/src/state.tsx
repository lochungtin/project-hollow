import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getDeviceAPI, uploadDicomAPI } from './api/client'


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
	const [haveContours, setHaveContours] = useState({"A": false, "B": false})


	useEffect(() => {
		getDeviceAPI().then(setDevice)
		return () => {}
	}, [])

	const uploadDicom = useCallback(async (slot: string, files: File[]) => {
		setUploading({...uploading, [slot]: true})
		try {
			const ds = await uploadDicomAPI(slot, files)
			setDataset((prev) => ({...prev, [slot]: ds}))
			setHaveContours((prev) => ({...prev, [slot]: false}))
		} catch (err) {
			console.error(JSON.stringify(err))
		} finally {
			setUploading((prev) => ({...prev, [slot]: false}))
		}
	}, [])


	const value = useMemo(() => ({
		device,
		uploading, uploadDicom,
		dataset, haveContours,
	}), [
		device,
		uploading, uploadDicom,
		dataset, haveContours,
	])

	return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}