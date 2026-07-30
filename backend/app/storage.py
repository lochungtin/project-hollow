import torch

DEV = "cuda" if torch.cuda.is_available() else "cpu"


def getDevice():
    return DEV
