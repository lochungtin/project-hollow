import torch

_DEV = "cuda" if torch.cuda.is_available() else "cpu"
_DATASET_STORAGE = {
    "A": None,
    "B": None,
}


def getDevice():
    return _DEV


def getDataset(slot):
    return _DATASET_STORAGE[slot]


def setDataset(slot, dataset):
    _DATASET_STORAGE[slot] = dataset


def clearDataset(slot):
    _DATASET_STORAGE[slot] = None


def toggleDataset(slot):
    return "B" if slot == "A" else "A"
