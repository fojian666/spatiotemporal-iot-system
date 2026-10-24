"""Wire contracts for external integrations.

`DeviceReadingPayload` is the stable v1 contract for the telemetry topic
`iot/pingan/devices/{device_id}/telemetry`. Real devices publish this shape
(QoS 1, MQTT over TLS); the backend validates every message against it and
drops anything invalid. Bump `version` on breaking changes and keep old
fields intact.
"""

import math

from pydantic import BaseModel, ConfigDict, Field, field_validator

MAX_METRICS = 32


class DeviceReadingPayload(BaseModel):
    version: int = 1
    device_id: str = Field(min_length=1, max_length=24)
    # ISO-8601 with timezone; falls back to the server receive time when absent.
    ts: str | None = None
    scenario: str = "normal"
    # Metric name -> numeric value. Kept open-ended on purpose so devices can
    # report any sensor set; threshold definitions live in the device registry.
    metrics: dict[str, float] = Field(default_factory=dict)

    @field_validator("metrics")
    @classmethod
    def _validate_metrics(cls, value: dict[str, float]) -> dict[str, float]:
        if len(value) > MAX_METRICS:
            raise ValueError(f"metrics 数量超过 {MAX_METRICS}")
        for key, item in value.items():
            if not key or len(key) > 40:
                raise ValueError("metric 名称长度必须在 1-40 之间")
            if not math.isfinite(item):
                raise ValueError(f"metric '{key}' 必须是有限数值")
        return value

    model_config = ConfigDict(extra="ignore")
