import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getDevice } from './api/client'
interface AppStateValue {}

const AppStateContext = createContext<any>({})

export const useAppState = () =>  {
	const ctx = useContext(AppStateContext)
	if (!ctx)
		throw new Error('useAppState must be used within AppStateProvider')
	
	return ctx
}

export const AppStateProvider = ({ children }: { children: any })  => {
	const [device, setDevice] = useState("")

	useEffect(() => {
		getDevice().then(setDevice)
		return () => {}
	}, [])


	const value = useMemo(() => ({
		device,
	}), [
		device,
	])

	return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}