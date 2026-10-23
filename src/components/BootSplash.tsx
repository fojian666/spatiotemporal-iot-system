export function BootSplash({
  title = '正在接入服务端数据总线',
  detail = 'ESTABLISHING WSS · POSTGIS · MQTT',
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div className="boot-splash">
      <div className="boot-splash__mark">
        <span />
        <span />
        <span />
      </div>
      <span className="overline">CONNECTING TO SECURE IOT BUS</span>
      <strong>{title}</strong>
      <p>{detail}</p>
      <div className="boot-splash__bar"><i /></div>
    </div>
  );
}
