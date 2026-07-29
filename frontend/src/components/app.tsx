// import { useAppState } from '../state'

import Alert from './notifications/alert'
import Toast from './notifications/toast'

import DataPane from './panels/data'
import InfoPane from './panels/info'
import Toolbar from './panels/toolbar'
import ViewPane from './panels/view'


const App = () => {
	// const appState = useAppState()
	return (
		<div className='app-shell'>
			<Toolbar />
			<div className='app-body'>
				<InfoPane />
				<ViewPane />
				<DataPane />
			</div>
			<Toast />
			<Alert />
		</div>
	)
}

export default App
