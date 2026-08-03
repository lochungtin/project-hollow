import asyncio
from time import time

from .models.job import COMPLETE, ERROR, RUNNING, Job


class Queue:
    def __init__(self):
        self.jobs = {}
        self.subscribers = []

    def subscribe(self, callback):
        self.subscribers.append(callback)

    def unsubscribe(self, callback):
        if callback in self.subscribers:
            self.subscribers.remove(callback)

    def getJob(self, id):
        return self.jobs.get(id)

    def getAll(self):
        return [
            j.summary()
            for j in sorted(self.jobs.values(), key=lambda j: j.t_sta, reverse=True)
            if j.status == "pending" or j.status == "running"
        ]

    def launch(self, name, fn):
        job = Job(name=name)
        self.jobs[job.id] = job
        print(f"Created Job: {name} {job.id}")
        asyncio.create_task(self.run(job, fn))
        return job

    async def run(self, job, fn):
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
            await self.broadcast(job)
            job.t_fin = time()

    async def broadcast(self, job):
        for i, subscriber in enumerate(self.subscribers):
            try:
                await subscriber({"type": "update", "job": job.summary()})
            except Exception as E:
                print(f"Failed to boardcast to [Listener {i}]")
                print(E)
