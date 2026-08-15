import Alert from './notifications/alert'
import ToastContainer from './notifications/toast'

import DataPane from './panels/data'
import InfoPane from './panels/info'
import Toolbar from './panels/toolbar'
import ViewPane from './panels/view'


const App = () => {
	return (
		<div className='app-shell'>
			<Toolbar />
			<main className='app-content'>
				<div className='app-body'>
					<InfoPane />
					<ViewPane />
				</div>
				<DataPane />
				<ToastContainer />
				<Alert />
			</main>
		</div>
	)
}

export default App
