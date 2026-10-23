import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  Camera,
  ChevronRight,
  Crosshair,
  Map as MapIcon,
  MapPin,
  Radio,
  ScanLine,
  Sparkles,
  Video as VideoIcon,
} from 'lucide-react';
import { MapView } from '../components/MapView';
import { VideoFeed } from '../components/VideoFeed';
import { DeviceIcon, LevelPill, Panel, ProgressBar, StatusPill, StatusText } from '../components/ui';
import { DEVICES, KIND_META, type DeviceDefinition } from '../data/devices';
import { metricState, useSimulation } from '../engine/simulation';
import { useAuth } from '../auth/AuthContext';

type AssetTab = 'unmanned' | 'video' | 'sensing';

const UNMANNED_KINDS = ['drone', 'ugv', 'usv', 'satellite'];

function getGeoMetrics(device: DeviceDefinition, reading: Record<string, number>) {
  if (device.metrics.length) {
    return device.metrics.slice(0, 4).map((def) => {
      const value = Number(reading[def.key] ?? 0);
      return {
        label: def.label,
        value: value.toFixed(def.digits),
        unit: def.unit,
        state: metricState(def, value),
      };
    });
  }
  if (device.kind === 'drone') {
    return [
      { label: '飞行高度', value: String(Math.round(reading.altitude ?? 120)), unit: 'm', state: 'normal' as const },
      { label: '地速', value: String(reading.speed ?? 8.4), unit: 'm/s', state: 'normal' as const },
      { label: '电量', value: String(reading.battery ?? device.battery), unit: '%', state: 'normal' as const },
      { label: '任务进度', value: String(Math.round(reading.progress ?? 64)), unit: '%', state: 'normal' as const },
    ];
  }
  if (device.kind === 'ugv' || device.kind === 'usv') {
    return [
      { label: '行驶速度', value: String(reading.speed ?? 2.1), unit: 'm/s', state: 'normal' as const },
      { label: '电量', value: String(reading.battery ?? device.battery), unit: '%', state: 'normal' as const },
      { label: '任务进度', value: String(Math.round(reading.progress ?? 48)), unit: '%', state: 'normal' as const },
      { label: '信号', value: String(device.signal), unit: '%', state: 'normal' as const },
    ];
  }
  if (device.kind === 'satellite') {
    return [
      { label: '轨道高度', value: '561', unit: 'km', state: 'normal' as const },
      { label: '地面分辨率', value: '2', unit: 'm', state: 'normal' as const },
      { label: '云量', value: String(reading.cloud ?? 12), unit: '%', state: 'normal' as const },
      { label: '过境进度', value: String(Math.round(reading.progress ?? 35)), unit: '%', state: 'normal' as const },
    ];
  }
  if (device.kind === 'video') {
    return [
      { label: 'AI 事件', value: String(reading.aiEvents ?? 0), unit: '起', state: 'normal' as const },
      { label: '分辨率', value: '4K', unit: '', state: 'normal' as const },
      { label: '码率', value: '8.4', unit: 'Mbps', state: 'normal' as const },
      { label: '在线时长', value: '360', unit: '天', state: 'normal' as const },
    ];
  }
  if (device.kind === 'gateway') {
    return [
      { label: '连接节点', value: String(reading.connected ?? 9), unit: '个', state: 'normal' as const },
      { label: '平均时延', value: String(reading.latency ?? 18), unit: 'ms', state: 'normal' as const },
      { label: '吞吐', value: String(reading.throughput ?? 1240), unit: 'msg/s', state: 'normal' as const },
      { label: '信号', value: String(device.signal), unit: '%', state: 'normal' as const },
    ];
  }
  return [];
}

function assetMeta(device: DeviceDefinition, reading: Record<string, number>) {
  if (device.kind === 'drone' || device.kind === 'ugv' || device.kind === 'usv') {
    return { primary: `${Math.round(reading.progress ?? 58)}%`, secondary: `电量 ${reading.battery ?? device.battery}%`, progress: Number(reading.progress ?? 58) };
  }
  if (device.kind === 'satellite') {
    return { primary: '过境观测', secondary: `云量 ${reading.cloud ?? 12}%`, progress: Number(reading.progress ?? 35) };
  }
  if (device.kind === 'video') {
    return { primary: `${reading.aiEvents ?? 0} 起 AI 事件`, secondary: '4K · 实时', progress: 0 };
  }
  const first = device.metrics[0];
  if (first) {
    return {
      primary: `${Number(reading[first.key] ?? 0).toFixed(first.digits)}${first.unit}`,
      secondary: first.label,
      progress: 0,
    };
  }
  return { primary: '在线', secondary: device.protocol, progress: 0 };
}

export function GeoMapPage() {
  const { scenario, readings, deviceStatuses, alerts, stats, events, cycleAlert } = useSimulation();
  const { canOperate } = useAuth();
  const [searchParams] = useSearchParams();
  const focusParam = searchParams.get('focus');
  const [selectedId, setSelectedId] = useState<string | null>(focusParam ?? 'UAV-01');
  const [assetTab, setAssetTab] = useState<AssetTab>('unmanned');
  const [cameraId, setCameraId] = useState('CAM-01');

  useEffect(() => {
    if (focusParam) setSelectedId(focusParam);
  }, [focusParam]);

  const selectedDevice = DEVICES.find((device) => device.id === selectedId) ?? null;
  const selectedReading = selectedId ? readings[selectedId] ?? {} : {};
  const selectedStatus = selectedId ? deviceStatuses[selectedId] : 'online';

  useEffect(() => {
    if (selectedDevice?.kind === 'video') setCameraId(selectedDevice.id);
  }, [selectedDevice]);

  const cameras = DEVICES.filter((device) => device.kind === 'video');
  const camera = cameras.find((item) => item.id === cameraId) ?? cameras[0];
  const missionDrone = scenario.key === 'fire' ? 'UAV-02' : 'UAV-01';
  const missionReading = readings[missionDrone] ?? {};
  const missionProgress = Number(missionReading.progress ?? 64);

  const listDevices = useMemo(() => {
    if (assetTab === 'unmanned') return DEVICES.filter((device) => UNMANNED_KINDS.includes(device.kind));
    if (assetTab === 'video') return DEVICES.filter((device) => device.kind === 'video');
    return DEVICES.filter((device) => !UNMANNED_KINDS.includes(device.kind) && device.kind !== 'video');
  }, [assetTab]);

  const heroMetrics = selectedDevice ? getGeoMetrics(selectedDevice, selectedReading) : [];

  return (
    <div className="geo-page">
      <MapView
        detailed
        className="geo-map"
        selectedId={selectedId}
        onSelect={setSelectedId}
        flyToSelected={Boolean(focusParam)}
        initialZoom={12.85}
      />

      <header className="geo-header">
        <span className="overline">SPATIOTEMPORAL ONE MAP · {scenario.code}</span>
        <h1>时空一张图</h1>
        <p>卫星遥感 · 无人机 · 视频 · 全无人系统</p>
        <div className="geo-header__chips">
          <StatusPill tone="online" dot>实时融合</StatusPill>
          <span className="geo-chip"><Radio size={12} /> 高分六号过境中</span>
          <span className="geo-chip"><ScanLine size={12} /> AI 识别开启</span>
          <span className="geo-scenario" style={{ '--sc': scenario.color } as CSSProperties}>
            <i /> {scenario.name}
          </span>
        </div>
      </header>

      <div className="geo-left">
        <Panel
          overline="LIVE RECON · UAV OPTICAL POD"
          title="实时侦察画面"
          icon={VideoIcon}
          className="geo-video-panel"
          extra={
            <div className="camera-switch">
              {cameras.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={camera?.id === item.id ? 'is-active' : ''}
                  onClick={() => setCameraId(item.id)}
                  title={item.name}
                >
                  {item.id.replace('CAM-0', 'C')}
                </button>
              ))}
            </div>
          }
        >
          <VideoFeed name={`${camera?.id ?? 'CAM-01'} · ${camera?.shortName ?? '平安驿高点'}`} />
          <div className="video-strip">
            <span><i className="dot dot--online" />识别目标 1</span>
            <span className="mono">码率 8.4 Mbps</span>
            <span className="mono">时延 126 ms</span>
          </div>
        </Panel>

        <Panel
          overline="TARGET LOCK"
          title={selectedDevice ? '目标详情' : '区域对象'}
          icon={Crosshair}
          className="geo-detail-panel"
          extra={selectedDevice ? <StatusText status={selectedStatus} /> : <span className="mono detail-text">{stats.total} NODES</span>}
        >
          <div className="geo-target-body" key={selectedId ?? 'empty'}>
          {selectedDevice ? (
            <>
              <div className="geo-target">
                <span className="geo-target__icon" style={{ color: KIND_META[selectedDevice.kind].color }}>
                  <DeviceIcon kind={selectedDevice.kind} size={22} />
                </span>
                <div>
                  <h4>{selectedDevice.name}</h4>
                  <span>{selectedDevice.id} · {selectedDevice.zone} · {KIND_META[selectedDevice.kind].label}</span>
                </div>
                <button type="button" className="icon-btn icon-btn--sm" title="取消选择" onClick={() => setSelectedId(null)}>
                  <MapPin size={14} />
                </button>
              </div>

              <div className="geo-metric-grid">
                {heroMetrics.map((metric) => (
                  <div className={`geo-metric geo-metric--${metric.state}`} key={metric.label}>
                    <span>{metric.label}</span>
                    <strong className="mono">{metric.value}<em>{metric.unit}</em></strong>
                  </div>
                ))}
              </div>

              {selectedDevice.metrics.length === 0 && selectedDevice.kind === 'video' && (
                <div className="geo-ai-clue">
                  <Sparkles size={13} />
                  <span>AI 线索：{scenario.key === 'fire' ? '检测到疑似烟点，置信度 0.96' : scenario.key === 'storm' ? '河面漂浮物聚集，置信度 0.88' : '河面目标，置信度 0.92'}</span>
                </div>
              )}

              <div className="geo-target__meta">
                <span>{selectedDevice.protocol}</span>
                <span>信号 {selectedDevice.signal}%</span>
                <span>电量 {selectedDevice.battery}%</span>
                <span className="mono">{selectedDevice.lng.toFixed(4)}°E / {selectedDevice.lat.toFixed(4)}°N</span>
              </div>

              <div className="geo-target__actions">
                <Link className="btn btn--sm btn--ai" to={`/copilot?q=${encodeURIComponent(`${selectedDevice.shortName}当前状态如何？`)}`}>
                  <Sparkles size={12} /> 询问大模型
                </Link>
                <Link className="btn btn--sm" to={`/simulation`}>
                  <ArrowUpRight size={12} /> 查看遥测
                </Link>
              </div>
            </>
          ) : (
            <div className="geo-empty">
              <Crosshair size={26} />
              <strong>点击地图或资产列表锁定目标</strong>
              <span>支持设备、无人系统与视频点位的空间联动</span>
            </div>
          )}
          </div>
        </Panel>
      </div>

      <div className="geo-right">
        <Panel
          overline="ASSET FLEET"
          title="空间资产"
          icon={MapIcon}
          extra={<span className="mono detail-text">{stats.unmannedActive} ACTIVE</span>}
          className="geo-assets"
        >
          <div className="asset-tabs">
            {(
              [
                { key: 'unmanned', label: '无人系统', count: DEVICES.filter((device) => UNMANNED_KINDS.includes(device.kind)).length },
                { key: 'video', label: '视频', count: 3 },
                { key: 'sensing', label: '感知站', count: DEVICES.filter((device) => !UNMANNED_KINDS.includes(device.kind) && device.kind !== 'video').length },
              ] as { key: AssetTab; label: string; count: number }[]
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={assetTab === tab.key ? 'is-active' : ''}
                onClick={() => setAssetTab(tab.key)}
              >
                {tab.label}<em>{tab.count}</em>
              </button>
            ))}
          </div>
          <div className="asset-list">
            {listDevices.map((device) => {
              const meta = assetMeta(device, readings[device.id] ?? {});
              return (
                <button
                  key={device.id}
                  type="button"
                  className={`asset-row ${selectedId === device.id ? 'is-selected' : ''}`}
                  onClick={() => setSelectedId(device.id)}
                >
                  <span className="asset-row__icon" style={{ color: KIND_META[device.kind].color }}>
                    <DeviceIcon kind={device.kind} size={16} />
                  </span>
                  <span className="asset-row__main">
                    <span className="asset-row__title">
                      <strong>{device.shortName}</strong>
                      <i className={`asset-dot asset-dot--${deviceStatuses[device.id]}`} />
                    </span>
                    <span className="asset-row__sub">{device.id} · {device.zone}</span>
                    {meta.progress ? <ProgressBar value={meta.progress} height={3} /> : null}
                  </span>
                  <span className="asset-row__value">
                    <strong className="mono">{meta.primary}</strong>
                    <em>{meta.secondary}</em>
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel
          overline="ALERTS · LINKED TO MAP"
          title="空间告警联动"
          icon={Radio}
          className="geo-alerts"
          extra={<Link className="panel-link panel-link--inline" to="/simulation">仿真推演 <ChevronRight size={12} /></Link>}
        >
          <div className="geo-alert-list">
            {alerts.slice(0, 4).map((alert) => (
              <button
                key={alert.id}
                type="button"
                className="geo-alert"
                onClick={() => {
                  setSelectedId(alert.source);
                }}
              >
                <span className="geo-alert__top">
                  <LevelPill level={alert.level} />
                  <em className="mono">{alert.time}</em>
                  <span className={`alert-status alert-status--${alert.status === '已完成' ? 'done' : alert.status === '处置中' ? 'doing' : 'todo'}`}>{alert.status}</span>
                </span>
                <strong>{alert.title}</strong>
                <span className="geo-alert__meta"><MapPin size={11} /> {alert.zone} · {alert.source}</span>
                <span
                  className={`geo-alert__action ${canOperate ? '' : 'is-disabled'}`}
                  aria-disabled={!canOperate}
                  onClick={canOperate ? (event) => { event.stopPropagation(); cycleAlert(alert.id); } : undefined}
                >
                  <Sparkles size={11} /> 联动
                </span>
              </button>
            ))}
          </div>
          <div className="geo-signal-feed">
            <span className="overline">LATEST SIGNALS</span>
            {events.slice(0, 3).map((event) => (
              <div key={event.id}>
                <i className={`signal-dot signal-dot--${event.type}`} />
                <span>{event.text}</span>
                <em className="mono">{event.time}</em>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="geo-mission-strip">
        <span className="mission-live"><i /> MISSION LIVE</span>
        <div className="mission-main">
          <strong>{scenario.key === 'fire' ? 'UAV-02 · 林火热源侦察' : 'UAV-01 · 湟水河多源巡检'}</strong>
          <span className="mono">8 航点 · 高度 120m · 视距链路</span>
        </div>
        <div className="mission-progress">
          <ProgressBar value={missionProgress} height={4} label={scenario.key === 'fire' ? 'UAV-02' : 'UAV-01'} />
        </div>
        <div className="mission-meta">
          <span className="mono">ALT {missionReading.altitude ?? 120}m</span>
          <span className="mono">BAT {missionReading.battery ?? 86}%</span>
          <span className="mono">GPS 12</span>
        </div>
        <Link to="/copilot?q=%E7%94%9F%E6%88%90%E4%B8%80%E6%AC%A1%E6%97%A0%E4%BA%BA%E6%9C%BA%E5%B7%A1%E6%A3%80%E4%BB%BB%E5%8A%A1" className="btn btn--sm btn--ghost">
          <Sparkles size={12} /> 任务助手
        </Link>
      </div>
    </div>
  );
}
