import { createContext, useContext } from 'react'

interface AppStateValue {}

const AppStateContext = createContext<AppStateValue | null>(null)

export function useAppState(): AppStateValue {
	const ctx = useContext(AppStateContext)
	if (!ctx)
		throw new Error('useAppState must be used within AppStateProvider')
	
	return ctx
}
