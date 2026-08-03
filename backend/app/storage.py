import asyncio
from time import time

import torch

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

    def launch(self, name, op, fn):
        job = Job(name=name, type=op)
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

            setResult(job.type, result)
            print(f"Job {job.name} {job.id}: complete")

        except Exception as e:
            job.error = str(e) or e.__class__.__name__
            job.status = ERROR

            print(f"Job {job.name} {job.id}: failed")

        finally:
            job.t_fin = time()
            await self.broadcast(job)

    async def broadcast(self, job):
        for i, subscriber in enumerate(self.subscribers):
            try:
                await subscriber({"type": "update", "job": job.summary()})
            except Exception as E:
                print(f"Failed to boardcast to [Listener {i}]")
                print(E)


# --- STORAGE
_DEV = "cuda" if torch.cuda.is_available() else "cpu"
_DATASET_STORAGE = {
    "A": None,
    "B": None,
}
_GUAVA_STORAGE = {
    "masks": {"A": {}, "B": {}},
    "regions": {"A": None, "B": None},
    "metric": None,
}
_RESULT_STORAGE = {
    "bsd": {},
    "disp": {},
    "sepd": {},
    "divh": {},
    "sepdn": {},
}


# --- GETTERS
def getDevice():
    return _DEV


def getDataset(slot):
    return _DATASET_STORAGE[slot]


def getGuavaStore():
    return _GUAVA_STORAGE


def getResults(op=None):
    if op is None:
        return _RESULT_STORAGE
    return _RESULT_STORAGE[op]


# --- SETTERS
def setDataset(slot, dataset):
    _DATASET_STORAGE[slot] = dataset


def clearDataset(slot):
    _DATASET_STORAGE[slot] = None


def clearGuavaStore(slot):
    _GUAVA_STORAGE["masks"][slot] = {}
    _GUAVA_STORAGE["regions"][slot] = None
    _GUAVA_STORAGE["metrics"] = None


def setResult(op, result):
    _RESULT_STORAGE[op] = result


# JOB QUEUE
QUEUE = Queue()
