import torch

from .queue import Queue

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
