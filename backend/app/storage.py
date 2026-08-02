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

# JOB QUEUE
QUEUE = Queue()


# --- GETTERS
def getDevice():
    return _DEV


def getDataset(slot):
    return _DATASET_STORAGE[slot]


def getGuavaStore():
    return _GUAVA_STORAGE


# --- SETTERS
def setDataset(slot, dataset):
    _DATASET_STORAGE[slot] = dataset


def clearDataset(slot):
    _DATASET_STORAGE[slot] = None


def clearGuavaStore(slot):
    _GUAVA_STORAGE["masks"][slot] = {}
    _GUAVA_STORAGE["regions"][slot] = None
    _GUAVA_STORAGE["metrics"] = None


def toggleDataset(slot):
    return "B" if slot == "A" else "A"
