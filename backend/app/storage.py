import torch

from .models.dataset import Dataset
from .queue import Queue

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


def getDevice() -> str:
    """Return the compute device ("cuda" or "cpu") selected at process start."""
    return _DEV


def getDataset(slot: str) -> Dataset | None:
    """Return the `Dataset` currently loaded into `slot`, or `None`."""
    return _DATASET_STORAGE[slot]


def getGuavaStore() -> dict:
    """Return the shared dict of per-slot GUAVA masks and built regions."""
    return _GUAVA_STORAGE


def getResults(op: str | None = None) -> dict:
    """Return one op's cached result dict, or the whole result store if `op` is `None`."""
    if op is None:
        return _RESULT_STORAGE
    return _RESULT_STORAGE[op]


def setDataset(slot: str, dataset: Dataset) -> None:
    """Store `dataset` as the loaded dataset for `slot`."""
    _DATASET_STORAGE[slot] = dataset


def clearDataset(slot: str) -> None:
    """Remove the dataset loaded into `slot`."""
    _DATASET_STORAGE[slot] = None


def clearGuavaStore(slot: str) -> None:
    """Reset `slot`'s GUAVA masks and built region."""
    _GUAVA_STORAGE["masks"][slot] = {}
    _GUAVA_STORAGE["regions"][slot] = None
    _GUAVA_STORAGE["metrics"] = None


def setResult(op: str, result: dict) -> None:
    """Cache `result` as the latest output of analysis op `op`."""
    _RESULT_STORAGE[op] = result


def clearResults(*ops: str) -> None:
    """Clear the cached result for each analysis op named in `ops`."""
    for op in ops:
        _RESULT_STORAGE[op] = {}


QUEUE = Queue()
