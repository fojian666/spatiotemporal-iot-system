import { useSimulation, formatSimTime } from '../engine/simulation';

export function VideoFeed({
  name = 'CAM-01 · 平安驿高点',
  compact = false,
  className = '',
}: {
  name?: string;
  compact?: boolean;
  className?: string;
}) {
  const { scenario, simTime } = useSimulation();
  const time = formatSimTime(simTime);
  const images: Record<string, string> = {
    normal: '/assets/aerial-river.jpg',
    storm: '/assets/aerial-flood.jpg',
    fire: '/assets/aerial-fire.jpg',
    pollution: '/assets/aerial-pollution.jpg',
  };
  const detections =
    scenario.key === 'fire'
      ? [
          { label: '烟点', confidence: 0.96, x: 34, y: 30, w: 22, h: 20 },
          { label: '热点', confidence: 0.91, x: 62, y: 56, w: 15, h: 17 },
        ]
      : scenario.key === 'pollution'
        ? [
            { label: '排口泡沫', confidence: 0.93, x: 42, y: 58, w: 24, h: 16 },
            { label: '采样船', confidence: 0.87, x: 68, y: 38, w: 13, h: 12 },
          ]
        : scenario.key === 'storm'
          ? [
              { label: '水位上涨', confidence: 0.94, x: 28, y: 55, w: 30, h: 22 },
              { label: '漂浮物', confidence: 0.86, x: 64, y: 44, w: 12, h: 10 },
            ]
          : [{ label: '河面目标', confidence: 0.92, x: 52, y: 46, w: 16, h: 13 }];

  return (
    <div className={`video-feed video-feed--${scenario.key} ${compact ? 'video-feed--compact' : ''} ${className}`}>
      <img key={scenario.key} src={images[scenario.key]} alt="无人机实时回传画面" />
      <div className="video-feed__tint" />
      <div className="video-feed__scan" />
      <div className="video-feed__noise" />
      <div className="video-feed__top">
        <span className="video-live"><i /> SIM LIVE</span>
        <span className="mono">{name}</span>
        <span className="video-feed__mode">AI 识别 <b>ON</b></span>
      </div>
      {!compact && (
        <div className="video-feed__crosshair">
          <span />
          <span />
        </div>
      )}
      {detections.map((box) => (
        <div
          key={box.label}
          className="video-bbox"
          style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
        >
          <span>{box.label} {box.confidence.toFixed(2)}</span>
        </div>
      ))}
      <div className="video-feed__grid" />
      <div className="video-feed__bottom">
        <span className="mono">{time.date} {time.time}</span>
        <span className="mono">ALT 120m · HDG 087° · 4K</span>
        <span className="video-feed__ai">多模态检测 · 12ms</span>
      </div>
    </div>
  );
}
