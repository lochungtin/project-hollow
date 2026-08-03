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


def getBSD():
    gvStore = getGuavaStore()
    rA, rB = gvStore["regions"]["A"], gvStore["regions"]["B"]
    if rA is None or rB is None:
        rA, rB = buildRegions()

    metrics = gv.Metrics(
        rA,
        rB,
        target_A=rA.target,
        target_B=rB.target,
        anchor_A=rA.anchor,
        anchor_B=rB.anchor,
    )

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
    return {}


def getSepD():
    return {}


def getDiVH():
    return {}


def getSepDN():
    return {}
