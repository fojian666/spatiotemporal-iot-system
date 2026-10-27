import { Check, ChevronRight, CornerUpLeft, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useSimulation } from '../engine/simulation';
import { useInvestigation } from './InvestigationProvider';
import { INVESTIGATION_STEPS, investigationTarget, investigationTimeRange, type InvestigationWindow } from './state';

const LABELS = { map: '地图定位', telemetry: '遥测复核', copilot: '辅助研判' };
export function InvestigationGuide() {
  const { investigation: item, end, setWindow } = useInvestigation();
  const { alerts, scenarioKey } = useSimulation();
  const location = useLocation();
  if (!item) return null;
  const available = item.scenarioKey === scenarioKey && alerts.some(alert => alert.id === item.alertId);
  const next = INVESTIGATION_STEPS.find(step => !item.visited[step]);
  return (
    <aside className="investigation-guide" aria-label="当前告警调查">
      <div className="investigation-guide__summary">
        <div className="investigation-guide__title"><span>正在调查</span><strong>{item.title}</strong><span className="mono">{item.deviceId}</span></div>
        <div className="investigation-guide__tools">
          <label>参考时段 <select aria-label="调查参考时段" value={item.minutes} onChange={event => setWindow(Number(event.target.value) as InvestigationWindow)}>
            <option value={30}>近 30 分钟</option><option value={60}>近 1 小时</option><option value={120}>近 2 小时</option>
          </select></label>
          <Link className="investigation-guide__return" to={available ? item.origin : '/'}><CornerUpLeft size={13} />{available ? '返回原告警' : '查看当前告警'}</Link>
          <button type="button" className="icon-btn" aria-label="结束本次调查" onClick={end}><X size={15} /></button>
        </div>
      </div>
      <div className="investigation-guide__body">
        <nav className="investigation-guide__steps" aria-label="告警调查步骤">
          {INVESTIGATION_STEPS.map(step => {
            const target = investigationTarget(item, step);
            const query = new URLSearchParams(location.search);
            const matchingDevice = step === 'copilot' ? query.get('q') === new URLSearchParams(target.split('?')[1]).get('q') : query.get('focus') === item.deviceId;
            const active = available && matchingDevice && location.pathname === target.split('?')[0];
            return <Link key={step} to={target} aria-current={active ? 'step' : undefined} data-visited={Boolean(item.visited[step])}>
              {item.visited[step] ? <Check size={13} /> : <ChevronRight size={13} />}<span>{LABELS[step]}</span><small>{item.visited[step] ? step === 'copilot' ? '已生成' : '已查看' : '待查看'}</small>
            </Link>;
          })}
        </nav>
        <p className="investigation-guide__hint">{available ? next ? `下一步：${LABELS[next]}` : '证据已查看，可返回告警人工更新状态。' : '原告警不在当前场景，保留调查记录。'}</p>
      </div>
      <p className="investigation-guide__range"><span>告警时间 {item.alertTime}</span><time>参考 {investigationTimeRange(item)}</time><span>仅记录参考时段，页面遥测仍实时更新。</span></p>
    </aside>
  );
}
