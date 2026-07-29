// import { useAppState } from '../state'

import Alert from './notifications/alert'
import Toast from './notifications/toast'

import DataPanel from './panels/data'
import InfoPanel from './panels/info'
import Toolbar from './panels/toolbar'
import ViewPanel from './panels/view'

const App = () => {
	// const appState = useAppState()
	return (
		<div className="app-shell">
			<Toolbar />
			<div className="app-body">
				<DataPanel />
				<ViewPanel />
				<InfoPanel />
			</div>
			<Toast />
			<Alert />
		</div>
	)
}

export default App
