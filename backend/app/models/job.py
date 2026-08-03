import uuid
from dataclasses import dataclass, field
from time import time

PENDING = "pending"
RUNNING = "running"
COMPLETE = "complete"
ERROR = "error"


@dataclass
class Job:
    name: str
    type: str
    status: str = PENDING
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    t_sta: float = field(default_factory=time)
    t_fin: float = -1
    result: dict = field(default_factory=dict)
    error: str = ""

    def summary(self):
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "status": self.status,
            "t_sta": self.t_sta,
            "t_fin": self.t_fin,
            "result": self.result,
            "error": self.error,
        }
