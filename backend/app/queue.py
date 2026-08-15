import asyncio
from collections.abc import Awaitable, Callable
from time import time
from typing import Any

import torch

from .models.job import COMPLETE, ERROR, RUNNING, Job

Subscriber = Callable[[dict], Awaitable[None]]


class Queue:
    def __init__(self) -> None:
        """Initialize an empty job registry with no subscribers."""
        self.jobs: dict[str, Job] = {}
        self.subscribers: list[Subscriber] = []

    def subscribe(self, callback: Subscriber) -> None:
        """Register `callback` to receive job list/update broadcasts."""
        self.subscribers.append(callback)

    def unsubscribe(self, callback: Subscriber) -> None:
        """Remove `callback` from the broadcast subscriber list."""
        if callback in self.subscribers:
            self.subscribers.remove(callback)

    def getJob(self, id: str) -> Job | None:
        """Return the job with the given `id`, or `None` if unknown."""
        return self.jobs.get(id)

    def getAll(self) -> list[dict]:
        """Return pending/running jobs, most recently started first."""
        return [
            j.summary()
            for j in sorted(self.jobs.values(), key=lambda j: j.t_sta, reverse=True)
            if j.status == "pending" or j.status == "running"
        ]

    def launch(self, name: str, op: str, fn: Callable[[], Any]) -> Job:
        """Create and schedule a new job running `fn`, returning it immediately."""
        job = Job(name=name, type=op)
        self.jobs[job.id] = job
        print(f"Created Job: {name} {job.id}")
        asyncio.create_task(self.run(job, fn))
        return job

    async def run(self, job: Job, fn: Callable[[], Any]) -> None:
        """Run `fn` in a worker thread, updating and broadcasting `job`'s status as it goes."""
        await asyncio.sleep(2)

        job.status = RUNNING
        job.t_sta = time()
        await self.broadcast(job)

        try:
            print(f"Job {job.name} {job.id}: running")

            result = await asyncio.to_thread(fn)
            job.result = result
            job.status = COMPLETE

            print(f"Job {job.name} {job.id}: complete")

        except Exception as e:
            job.error = str(e) or e.__class__.__name__
            job.status = ERROR

            print(f"Job {job.name} {job.id}: failed")

        finally:
            job.t_fin = time()
            await self.broadcast(job)

    async def broadcast(self, job: Job) -> None:
        """Send `job`'s current state to every subscriber, ignoring individual failures."""
        for i, subscriber in enumerate(self.subscribers):
            try:
                await subscriber({"type": "update", "job": job.summary()})
            except Exception as E:
                print(f"Failed to boardcast to [Listener {i}]")
                print(E)
