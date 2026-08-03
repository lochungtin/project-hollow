import asyncio
import os

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..storage import QUEUE

ACTIVE_CONNECTIONS = 0
EVER_CONNECTED = False
SHUTDOWN = None

router = APIRouter()


@router.websocket("/ws")
async def handshake(websocket: WebSocket):
    global ACTIVE_CONNECTIONS, EVER_CONNECTED, SHUTDOWN

    await websocket.accept()
    ACTIVE_CONNECTIONS += 1
    print(f"[CONNECT]\tCurrent active connections: {ACTIVE_CONNECTIONS}")
    EVER_CONNECTED = True
    if SHUTDOWN is not None:
        print("[CANCEL]\tCancelled shutdown sequence.")
        SHUTDOWN.cancel()
        SHUTDOWN = None

    async def send(payload):
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
            SHUTDOWN = asyncio.create_task(shutdown())


async def shutdown() -> None:
    await asyncio.sleep(5)
    if ACTIVE_CONNECTIONS == 0:
        print("[SHUTDOWN]\tNo active connections - shutting down.")
        # os._exit(0)
