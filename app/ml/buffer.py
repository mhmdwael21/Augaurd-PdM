"""Rolling buffer of raw (unscaled) sensor rows.

Holds at least the classifier window (360) plus margin. Each branch pulls the
window it needs and applies its own scaler (handoff §1.4 — one raw buffer).
"""
from collections import deque

import numpy as np


class RawBuffer:
    def __init__(self, capacity):
        self.rows = deque(maxlen=capacity)

    def push(self, row):
        self.rows.append(np.asarray(row, dtype=np.float32))

    def __len__(self):
        return len(self.rows)

    def window(self, n):
        """Last n rows as an (n, n_channels) array, or None if not enough yet."""
        if len(self.rows) < n:
            return None
        return np.stack(list(self.rows)[-n:])
