import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Activity, Boxes, ChevronRight, CloudSun, Cpu, Layers3, Radio, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useSimulation } from '../engine/simulation';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { StatusPill } from './ui';

const ARCH_LAYERS = [
  {
    key: 'app',
    label: '应用层',
    en: 'APPLICATION',
    icon: Layers3,
    color: '#ff84a8',
    desc: '业务闭环与人机协同',
    items: ['智慧水务', '森林防火', '无人机巡检', '应急指挥', '精准农业', '城市治理'],
  },
  {
    key: 'ai',
    label: '智能层',
    en: 'INTELLIGENCE',
    icon: Sparkles,
    color: '#ffbc5c',
    desc: '语义理解与自主决策',
    items: ['物联网知识图谱', '物联大模型', 'RAG 证据链', 'Agent 编排', '时序预测', '视觉识别'],
  },
  {
    key: 'platform',
    label: '平台层',
    en: 'PLATFORM',
    icon: Boxes,
    color: '#a78bfa',
    desc: '统一接入、时空数据与任务调度',
    items: ['设备接入', '流式计算', '时空数据库', '规则引擎', '任务编排', '数字孪生', '媒体资产'],
  },
  {
    key: 'edge',
    label: '边缘层',
    en: 'EDGE',
    icon: Cpu,
    color: '#4be1ff',
    desc: '近源计算与自治协同',
    items: ['边缘网关', '协议转换', '本地推理', '断网续传', '时空对齐'],
  },
  {
    key: 'perception',
    label: '感知层',
    en: 'PERCEPTION',
    icon: Radio,
    color: '#23e6b0',
    desc: '空天地一体化多源感知',
    items: ['智能传感器', '视频点位', '无人机', '无人车 / 无人船', '遥感卫星', '北斗定位'],
  },
];

export function ArchitectureModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { stats } = useSimulation();
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(modalRef, rendered);

  useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
      return undefined;
    }
    if (!rendered) return undefined;
    setClosing(true);
    const timer = window.setTimeout(() => {
      setRendered(false);
      setClosing(false);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [open, rendered]);

  useEffect(() => {
    if (!rendered) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [rendered, onClose]);

  if (!rendered) return null;
  return (
    <div className={`modal-mask ${closing ? 'is-closing' : ''}`} onClick={onClose} role="presentation">      <div ref={modalRef} className="arch-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="系统架构" tabIndex={-1}>
        <header className="arch-modal__head">
          <div>
            <span className="overline">END · EDGE · CLOUD · INTELLIGENCE</span>
            <h2>时空智能物联网系统架构</h2>
            <p>以统一时空基准贯通空天地感知、边缘协同、平台服务与物联大模型，形成“感知—认知—决策—行动”闭环。</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="arch-body">
          <aside className="arch-side">
            <div className="arch-side__block">
              <span className="overline">NETWORK FABRIC</span>
              <div className="arch-chips">
                {['MQTT', 'CoAP', 'NB-IoT', 'LoRaWAN', '5G 切片', '北斗短报文', 'TSN'].map((item) => (
                  <span key={item} className="arch-chip">
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="arch-side__block">
              <span className="overline">SECURITY</span>
              <div className="arch-security">
                <ShieldCheck size={16} />
                <div>
                  <strong>零信任安全体系</strong>
                  <span>设备身份认证 · 数据分级脱敏 · 全链路审计</span>
                </div>
              </div>
            </div>
            <div className="arch-side__block arch-side__stats">
              <div>
                <span>在线感知节点</span>
                <strong className="mono">{stats.online}<small> / {stats.total}</small></strong>
              </div>
              <div>
                <span>实时消息速率</span>
                <strong className="mono">{stats.messageRate.toLocaleString()}<small> msg/s</small></strong>
              </div>
              <div>
                <span>区域健康度</span>
                <strong className="mono">{Math.round(stats.regionHealth)}<small> / 100</small></strong>
              </div>
            </div>
            <div className="arch-flow">
              <span>数据上行</span>
              <i />
              <span>语义上行</span>
              <i />
              <span>指令下行</span>
            </div>
          </aside>

          <div className="arch-layers">
            {ARCH_LAYERS.map((layer, index) => {
              const Icon = layer.icon;
              return (
                <div className="arch-layer" key={layer.key} style={{ '--layer-color': layer.color } as CSSProperties}>
                  <div className="arch-layer__label">
                    <span className="arch-layer__icon">
                      <Icon size={16} />
                    </span>
                    <div>
                      <strong>{layer.label}</strong>
                      <span className="mono">{layer.en}</span>
                    </div>
                  </div>
                  <div className="arch-layer__main">
                    <div className="arch-layer__desc">
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      {layer.desc}
                    </div>
                    <div className="arch-layer__items">
                      {layer.items.map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>
                  </div>
                  {index < ARCH_LAYERS.length - 1 && (
                    <span className="arch-connector">
                      <ChevronRight size={12} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <footer className="arch-modal__foot">
          <div className="arch-foot-flow">
            <span><Activity size={13} /> 多源感知</span>
            <i />
            <span><CloudSun size={13} /> 边缘汇聚</span>
            <i />
            <span><Cpu size={13} /> 平台计算</span>
            <i />
            <span><Sparkles size={13} /> 图谱 + 大模型</span>
            <i />
            <span>自主行动</span>
          </div>
          <StatusPill tone="ai">演示架构 · 端边云用一体化</StatusPill>
        </footer>
      </div>
    </div>
  );
}

export function useArchitectureModal() {
  const [open, setOpen] = useState(false);
  return { open, openModal: () => setOpen(true), closeModal: () => setOpen(false) };
}
