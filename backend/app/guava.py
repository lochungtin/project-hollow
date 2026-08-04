import guava_rt as gv
import numpy as np

from .storage import getDataset, getDevice, getGuavaStore


def buildRegions():
    gvStore = getGuavaStore()

    for slot in ("A", "B"):
        dataset = getDataset(slot)

        masks = []
        labels = []
        for name, mask in gvStore["masks"][slot].items():
            masks.append(mask)
            labels.append(name)

        if len(labels) > 0:
            target = labels[0]
            if dataset.targetID != "unknown":
                target = dataset.contours[dataset.targetID].name

            gvStore["regions"][slot] = gv.Region(
                *masks,
                target=target,
                anchor=np.asarray(getDataset(slot).anchor),
                labels=labels,
                dev=getDevice()
            )

    return gvStore["regions"]["A"], gvStore["regions"]["B"]


def buildMetrics(rA, rB):
    return gv.Metrics(
        rA,
        rB,
        target_A=rA.target,
        target_B=rB.target,
        anchor_A=rA.anchor,
        anchor_B=rB.anchor,
    )


def getBSD():
    gvStore = getGuavaStore()
    rA, rB = gvStore["regions"]["A"], gvStore["regions"]["B"]
    if rA is None or rB is None:
        rA, rB = buildRegions()

    metrics = buildMetrics(rA, rB)

    asd = metrics.getBSDDiff("ASD")
    hd95 = metrics.getBSDDiff("HD95")
    hd = metrics.getBSDDiff("HD")

    rt = {}
    for name, val in asd.items():
        rt[name] = {
            "ASD": val.item(),
            "HD95": hd95[name].item(),
            "HD": hd[name].item(),
        }

    return rt


def getDisp():
    metrics = buildMetrics(*buildRegions())
    rt = {}
    for name, val in metrics.getROIDisplacementDiff().items():
        rt[name] = val.cpu().numpy().tolist()

    return rt


def getSepD():
    metrics = buildMetrics(*buildRegions())
    rt = {}
    for name, rows in metrics.getSeparationDistanceDiff("volume").items():
        _rt = []
        for val in rows:
            row = val.cpu().numpy()
            _rt.append([v for i, v in enumerate(row) if i in (0, 1, 3, 6, 7)])

        first = _rt.pop(0)
        _rt.append(first)

        _rt = np.asarray(_rt).T
        rt[name] = _rt.tolist()

    return rt


def getDiVH():
    metrics = buildMetrics(*buildRegions())

    return {}


def getSepDN():
    metrics = buildMetrics(*buildRegions())
    rt = {}
    for name, rows in metrics.getSeparationDistanceDiff("rcvs").items():
        _rt = []
        for val in rows:
            row = val.cpu().numpy()
            _rt.append([v for i, v in enumerate(row) if i in (0, 1, 3, 6, 7)])

        first = _rt.pop(0)
        _rt.append(first)

        _rt = np.asarray(_rt).T
        rt[name] = _rt.tolist()

    return rt
