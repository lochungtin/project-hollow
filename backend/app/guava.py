import guava_rt as gv
import numpy as np

from .storage import getDataset, getDevice, getGuavaStore


def getRegions():
    rt = {"A": None, "B": None}

    gvStore = getGuavaStore()

    for slot in rt.keys():
        masks = []
        labels = []
        for name, mask in gvStore["masks"][slot].items():
            masks.append(mask)
            labels.append(name)

        if len(labels) > 0:
            rt[slot] = gv.Region(
                *masks,
                target=labels[0],
                anchor=np.asarray(getDataset(slot).anchor),
                labels=labels,
                dev="cpu"
            )

    return rt["A"], rt["B"]


def getBSD():
    regionA, regionB = getRegions()
    if regionA is None or regionB is None:
        return None

    metrics = gv.Metrics(
        regionA,
        regionB,
        target_A=regionA.target,
        target_B=regionB.target,
        anchor_A=regionA.anchor,
        anchor_B=regionB.anchor,
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
