import { Listener, ResponseQueue } from "../types"

class Socket {
  	private ws: WebSocket | null = null
  	private listeners: Listener[] = []
  	private reconnectTimer: number | null = null
  	private closedByUser: boolean = false

  	connect(): void {
    	this.closedByUser = false
    	const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
		
    	this.ws = new WebSocket(`${protocol}://${location.host}/ws`)
    	this.ws.onmessage = (ev) => {
      		try {
        		const msg = JSON.parse(ev.data) as ResponseQueue
        		this.listeners.forEach((l) => l(msg))
      		} catch {}
    	}
    
		this.ws.onclose = () => {
      		if (!this.closedByUser)
				this.reconnectTimer = window.setTimeout(() => this.connect(), 1500)
		}
  	}

  	subscribe(fn: Listener): () => void {
    	this.listeners.push(fn)
    	return () => {
      		this.listeners = this.listeners.filter((l) => l !== fn)
    	}
  	}

  	close(): void {
    	this.closedByUser = true
    	if (this.reconnectTimer !== null)
			window.clearTimeout(this.reconnectTimer)
		this.ws?.close()
	}
}

export const socket = new Socket()