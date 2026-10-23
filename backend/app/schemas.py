"""Wire contracts for external integrations.

`DeviceReadingPayload` is the stable v1 contract for the telemetry topic
`iot/pingan/devices/{device_id}/telemetry`. Real devices publish this shape
(QoS 1, MQTT over TLS); the backend validates every message against it and
drops anything invalid. Bump `version` on breaking changes and keep old
fields intact.
"""

from pydantic import BaseModel, ConfigDict, Field


class DeviceReadingPayload(BaseModel):
    version: int = 1
    device_id: str = Field(min_length=1, max_length=24)
    # ISO-8601 with timezone; falls back to the server receive time when absent.
    ts: str | None = None
    scenario: str = "normal"
    # Metric name -> numeric value. Kept open-ended on purpose so devices can
    # report any sensor set; threshold definitions live in the device registry.
    metrics: dict[str, float] = Field(default_factory=dict)

    model_config = ConfigDict(extra="ignore")
