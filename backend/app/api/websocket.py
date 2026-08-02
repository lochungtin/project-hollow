import asyncio
import os

from fastapi import APIRouter, WebSocketDisconnect

from ..storage import QUEUE

router = APIRouter()

ACTIVE_CONNECTIONS = 0
EVER_CONNECTED = False
SHUTDOWN = None


@router.websocket("/ws")
async def handshake(websocket):
    global ACTIVE_CONNECTIONS, EVER_CONNECTED, SHUTDOWN

    await websocket.accept()
    ACTIVE_CONNECTIONS += 1
    EVER_CONNECTED = True
    if SHUTDOWN is not None:
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
        if ACTIVE_CONNECTIONS == 0 and EVER_CONNECTED:
            SHUTDOWN = asyncio.create_task(shutdown())


async def shutdown() -> None:
    await asyncio.sleep(5)
    if ACTIVE_CONNECTIONS == 0:
        print("No active connections - shutting down.")
        os._exit(0)
