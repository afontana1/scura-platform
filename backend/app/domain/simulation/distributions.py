import random
from typing import Any


def sample_triangular(params: Any, rng: random.Random) -> float:
    return rng.triangular(float(params.minimum), float(params.maximum), float(params.most_likely))


def sample_uncertainty(params: Any, rng: random.Random) -> float:
    # Supports triangular, uniform, pert-ish, and normal-ish behavior.
    # PERT/normal are approximated conservatively.
    distribution = str(params.distribution)
    low = float(params.minimum)
    mode = float(params.most_likely)
    high = float(params.maximum)
    if distribution.endswith("uniform"):
        return rng.uniform(low, high)
    if distribution.endswith("normal"):
        sigma = max((high - low) / 6.0, 1e-9)
        value = rng.gauss(mode, sigma)
        return max(low, min(high, value))
    return rng.triangular(low, high, mode)
