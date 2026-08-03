import asyncio

from .models.job import COMPLETE, ERROR, RUNNING, Job


class Queue:
    def __init__(self):
        self.jobs = {}
        self.subscribers = []

    def subscribe(self, callback):
        self.subscribers.append(callable)

    def unsubscribe(self, callback):
        if callback in self.subscribers:
            self.subscribers.remove(callable)

    def getJob(self, id):
        return self.jobs.get(id)

    def getAll(self):
        return [
            j.summary()
            for j in sorted(self.jobs.values(), key=lambda j: j.t_start, reverse=True)
        ]

    def launch(self, name, fn):
        job = Job(name=name)
        self.jobs[job.id] = job
        asyncio.create_task(self.run(job, fn))
        return job

    async def run(self, job, fn):
        job.status = RUNNING
        await self.broadcast(job)

        try:
            result = await asyncio.to_thread(fn)
            job.result = result
            job.status = COMPLETE
        except Exception as e:
            job.error = str(e) or e.__class__.__name__
            job.status = ERROR
        finally:
            await self.broadcast(job)

    async def broadcast(self, job):
        for subscriber in self.subscribers:
            try:
                subscriber({"type": "update", "job": job.summary()})
            except Exception:
                pass
