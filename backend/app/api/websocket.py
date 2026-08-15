import asyncio
import os

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..storage import QUEUE

ACTIVE_CONNECTIONS = 0
EVER_CONNECTED = False
SHUTDOWN = None

router = APIRouter()


@router.websocket("/ws")
async def handshake(websocket: WebSocket) -> None:
    """Accept a websocket client, stream job list/updates to it, and track connection count."""
    global ACTIVE_CONNECTIONS, EVER_CONNECTED, SHUTDOWN

    await websocket.accept()
    ACTIVE_CONNECTIONS += 1
    print(f"[CONNECT]\tCurrent active connections: {ACTIVE_CONNECTIONS}")
    EVER_CONNECTED = True
    if SHUTDOWN is not None:
        print("[CANCEL]\tCancelled shutdown sequence.")
        SHUTDOWN.cancel()
        SHUTDOWN = None

    async def send(payload: dict) -> None:
        """Send `payload` to this connection as JSON."""
        await websocket.send_json(payload)

    QUEUE.subscribe(send)
    try:
        await websocket.send_json({"type": "list", "jobs": QUEUE.getAll()})
        while True:
            await websocket.receive_text()

    except WebSocketDisconnect:
        pass

    finally:
        QUEUE.unsubscribe(send)
        ACTIVE_CONNECTIONS -= 1
        print(f"[CONNECT]\tCurrent active connections: {ACTIVE_CONNECTIONS}")
        if ACTIVE_CONNECTIONS == 0 and EVER_CONNECTED:
            print("[SHUTDOWN]\tQueued shutdown sequence.")
            SHUTDOWN = asyncio.create_task(_shutdown())


async def _shutdown() -> None:
    """Wait 5s, then log a shutdown notice if no client has reconnected.

    Process exit is currently disabled.
    """
    await asyncio.sleep(5)
    if ACTIVE_CONNECTIONS == 0:
        print("[SHUTDOWN]\tNo active connections - shutting down.")
        os._exit(0)
