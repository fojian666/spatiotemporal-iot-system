import { prefersReducedMotion, useReducedMotion } from '../motion';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  Database,
  FileText,
  Gauge,
  GitBranch,
  MessageSquare,
  Network,
  Plane,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  Waves,
  Workflow,
} from 'lucide-react';
import { PageHeader } from '../components/Shell';
import { Panel, StatusPill } from '../components/ui';
import { SCENARIO_LIST, type ScenarioKey } from '../data/scenarios';
import { formatSimTime, useSimulation } from '../engine/simulation';
import { useAuth } from '../auth/AuthContext';
import { REMOTE_ENABLED, copilotChat, fetchCopilotStatus } from '../services/api';
import {
  COPILOT_MODEL,
  COPILOT_SUGGESTIONS,
  askCopilot,
  resolveFocusDevice,
  type CopilotReply,
  type EvidenceKind,
} from '../services/llm';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  reply?: CopilotReply;
  /* 每条回答的真实来源：通道后来失效也不改写历史署名 */
  source?: 'cloud' | 'local';
  modelName?: string;
  time: string;
  animate: boolean;
}

const EVIDENCE_ICONS: Record<EvidenceKind, typeof Activity> = {
  telemetry: Gauge,
  alert: TriangleAlert,
  graph: Network,
  document: FileText,
};

const EVIDENCE_LABELS: Record<EvidenceKind, string> = {
  telemetry: '实时遥测',
  alert: '告警事件',
  graph: '图谱实体',
  document: '知识文档',
};

const SUGGESTION_ICONS = [ShieldCheck, Waves, Plane, Network, Sparkles, Activity];

function TypedText({
  text,
  animate,
  onProgress,
  onDone,
}: {
  text: string;
  animate: boolean;
  onProgress?: () => void;
  onDone?: () => void;
}) {
  const reduced = useReducedMotion();
  const timerRef = useRef<number | null>(null);
  const completedText = useRef<string | null>(null);
  const [shown, setShown] = useState(animate && !reduced ? 0 : text.length);
  const [done, setDone] = useState(!animate || reduced);
  const progressRef = useRef(onProgress);
  const doneRef = useRef(onDone);
  progressRef.current = onProgress;
  doneRef.current = onDone;

  useEffect(() => {
    const finish = () => {
      setShown(text.length);
      setDone(true);
      if (animate && completedText.current !== text) {
        completedText.current = text;
        doneRef.current?.();
      }
    };
    if (!animate || reduced || completedText.current === text) {
      finish();
      return undefined;
    }
    let index = 0;
    setShown(0);
    setDone(false);
    // 保留原有阅读速度，降低状态更新与自动滚动频率。
    timerRef.current = window.setInterval(() => {
      index = Math.min(text.length, index + 7);
      setShown(index);
      progressRef.current?.();
      if (index >= text.length) {
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        timerRef.current = null;
        finish();
      }
    }, 32);
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [text, animate, reduced]);

  const skip = () => {
    if (completedText.current === text) return;
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    completedText.current = text;
    setShown(text.length);
    setDone(true);
    doneRef.current?.();
  };

  return (
    <div className={`typed-text ${done ? 'is-done' : 'is-typing'}`}>
      {text.slice(0, shown)}
      {!done && <><span className="typed-caret" /><button type="button" className="typed-skip" onClick={skip}>显示完整回答</button></>}
    </div>
  );
}

function AssistantBubble({
  message,
  onAction,
  onAsk,
  onScroll,
}: {
  message: ChatMessage;
  onAction: (action: CopilotReply['actions'][number]) => void;
  onAsk: (query: string) => void;
  onScroll: () => void;
}) {
  const [revealed, setRevealed] = useState(!message.animate);
  const reply = message.reply;
  useEffect(() => {
    if (!revealed) return undefined;
    const timer = window.setTimeout(onScroll, 80);
    return () => window.clearTimeout(timer);
  }, [revealed, onScroll]);
  return (
    <div className="chat-message chat-message--assistant">
      <span className="chat-avatar chat-avatar--ai"><Bot size={15} /></span>
      <div className="chat-bubble-wrap">
        <div className="chat-meta">
          <strong>{message.source === 'cloud' ? message.modelName ?? '云端模型' : 'IoT-Seer'}</strong>
          <span>{message.source === 'cloud' ? '物联大模型' : '本地规则引擎'}</span>
          {reply && <em className={`intent-tag`}>{reply.intent}</em>}
        </div>
        <div className="chat-bubble chat-bubble--assistant">
          <TypedText
            text={message.text}
            animate={message.animate}
            onProgress={onScroll}
            onDone={() => {
              setRevealed(true);
              onScroll();
            }}
          />
          {reply && revealed && (
            <>
              <div className="answer-meta">
                <span className="answer-confidence">
                  <i style={{ width: `${reply.confidence * 100}%` }} />
                  <em>置信度 {(reply.confidence * 100).toFixed(0)}%</em>
                </span>
                <span className="mono">GROUNDED · {reply.evidence.length} SOURCES</span>
              </div>

              <div className="evidence-grid">
                {reply.evidence.map((evidence) => {
                  const Icon = EVIDENCE_ICONS[evidence.kind];
                  return (
                    <div className={`evidence-card evidence-card--${evidence.kind}`} key={evidence.id}>
                      <div className="evidence-card__top">
                        <span className="evidence-card__icon"><Icon size={12} /></span>
                        <em>{EVIDENCE_LABELS[evidence.kind]}</em>
                        <span className="mono evidence-score">{evidence.score.toFixed(2)}</span>
                      </div>
                      <strong>{evidence.title}</strong>
                      <p>{evidence.detail}</p>
                      {evidence.meta && <span className="evidence-meta">{evidence.meta}</span>}
                    </div>
                  );
                })}
              </div>

              <div className="answer-actions">
                {reply.actions.map((action, index) => (
                  <button
                    key={`${action.label}-${index}`}
                    type="button"
                    className={`answer-action ${action.kind === 'scenario' ? 'answer-action--scenario' : ''}`}
                    onClick={() => onAction(action)}
                  >
                    {action.kind === 'navigate' ? <ArrowUpRight size={12} /> : action.kind === 'scenario' ? <Activity size={12} /> : <Sparkles size={12} />}
                    {action.label}
                  </button>
                ))}
              </div>

              <div className="answer-followups">
                <span className="overline">CONTINUE</span>
                {reply.followups.map((followup) => (
                  <button key={followup} type="button" onClick={() => onAsk(followup)}>
                    {followup} <ChevronRight size={11} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <span className="chat-time mono">{message.time}</span>
      </div>
    </div>
  );
}

function UserBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="chat-message chat-message--user">
      <div className="chat-bubble-wrap">
        <div className="chat-meta chat-meta--user">
          <span>值班长</span>
          <span className="chat-time mono">{message.time}</span>
        </div>
        <div className="chat-bubble chat-bubble--user">{message.text}</div>
      </div>
      <span className="chat-avatar chat-avatar--user">CX</span>
    </div>
  );
}

export function CopilotPage() {
  const sim = useSimulation();
  const { scenario, stats, alerts, simTime, setScenario } = sim;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q');
  const { canOperate } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState('');
  const [toastLeaving, setToastLeaving] = useState(false);
  const [lastPipeline, setLastPipeline] = useState<CopilotReply['pipeline'] | null>(null);
  const [lastEvidence, setLastEvidence] = useState<CopilotReply['evidence']>([]);
  const [lastIntent, setLastIntent] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const forceScrollRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const toastLeaveTimerRef = useRef<number | null>(null);
  const lastInitialQueryRef = useRef<string | null>(null);
  /* 云端通道是否可用。探测失败或未启用时保持 false，整条链路退回本地规则引擎。 */
  const llmReadyRef = useRef(false);
  /* 仅用于界面署名：接上云端后顶栏要显示真实模型名，而不是"本地演示推理" */
  const [llmModel, setLlmModel] = useState<string | null>(null);
  const aliveRef = useRef(true);
  /* 每次发送/清空都递增；异步回来发现代际变了就丢弃，避免清空后插进孤立的回答 */
  const generationRef = useRef(0);
  const llmFailuresRef = useRef(0);

  const time = formatSimTime(simTime);
  const lastReply = useMemo(() => [...messages].reverse().find((message) => message.reply)?.reply ?? null, [messages]);

  const handleChatScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    stickToBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 96;
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    const node = scrollRef.current;
    if (!node) return;
    if (!force && !stickToBottomRef.current) return;
    node.scrollTop = node.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom(forceScrollRef.current);
    forceScrollRef.current = false;
  }, [messages.length, pending, scrollToBottom]);

  useEffect(() => {
    return () => {
      aliveRef.current = false;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (toastLeaveTimerRef.current) window.clearTimeout(toastLeaveTimerRef.current);
    };
  }, []);

  /* 启动时探一次大模型通道。没启用或探不通都不是错误——整页照旧走规则引擎。 */
  useEffect(() => {
    if (!REMOTE_ENABLED) return undefined;
    let cancelled = false;
    fetchCopilotStatus()
      .then((status) => {
        if (cancelled) return;
        llmReadyRef.current = status.available;
        setLlmModel(status.available ? status.model : null);
      })
      .catch(() => {
        llmReadyRef.current = false;
        if (!cancelled) setLlmModel(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const send = (raw: string) => {
    const query = raw.trim();
    if (!query || pending) return;
    const now = new Date();
    const stamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: query,
      time: stamp,
      animate: false,
    };
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setPending(true);
    forceScrollRef.current = true;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    /* 云端可用时 120ms 就发出（延迟由网络决定）；否则保留 620ms 的本地演示节奏 */
    const generation = ++generationRef.current;
    timerRef.current = window.setTimeout(() => {
      void (async () => {
        const local = askCopilot(query, sim);
        let reply = local;
        let source: 'cloud' | 'local' = 'local';
        let modelName: string | undefined;
        if (llmReadyRef.current) {
          try {
            /* 点名设备与本地检索用同一解析：否则云端上下文只补预警设备，回答不了 WQ-01 的正常读数 */
            const remote = await copilotChat(query, resolveFocusDevice(query));
            /* 200 但缺 text 时不能直接用：上层没有 ErrorBoundary，undefined.length 会白屏 */
            const text = typeof remote?.text === 'string' ? remote.text.trim() : '';
            if (text) {
              /* 证据链、动作与追问仍取本地检索结果（它们是真实数据），
                 但云端文案与它们没有因果关系，所以不虚抬置信度。 */
              reply = {
                ...local,
                text,
                pipeline: [
                  {
                    label: '云端推理',
                    detail: `${remote.model} · ${remote.usage?.total_tokens ?? 0} tokens`,
                    ms: remote.latencyMs,
                  },
                ],
              };
              source = 'cloud';
              modelName = remote.model;
              llmFailuresRef.current = 0;
            }
          } catch {
            /* 503 / 超时：静默回落本地规则引擎。连续两次失败就摘掉云端，
               否则每条消息都要白等一整轮超时。 */
            llmFailuresRef.current += 1;
            if (llmFailuresRef.current >= 2) {
              llmReadyRef.current = false;
              setLlmModel(null);
            }
          }
        }
        if (!aliveRef.current || generation !== generationRef.current) return;
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: reply.text,
          reply,
          source,
          modelName,
          time: stamp,
          animate: true,
        };
        setMessages((current) => [...current, assistantMessage]);
        setLastPipeline(reply.pipeline);
        setLastEvidence(reply.evidence);
        setLastIntent(reply.intent);
      })()
        .catch(() => {
          /* 规则引擎自身抛错时也要落到本地兜底，不能让 pending 永久挂着 */
        })
        .finally(() => {
          if (aliveRef.current && generation === generationRef.current) setPending(false);
        });
    }, llmReadyRef.current ? 120 : 620);
  };

  useEffect(() => {
    if (!initialQuery || lastInitialQueryRef.current === initialQuery) return undefined;
    lastInitialQueryRef.current = initialQuery;
    const timer = window.setTimeout(() => send(initialQuery), 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const showToast = (text: string) => {
    setToast(text);
    setToastLeaving(false);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    if (toastLeaveTimerRef.current) window.clearTimeout(toastLeaveTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      if (prefersReducedMotion()) {
        setToast('');
        setToastLeaving(false);
        return;
      }
      setToastLeaving(true);
      toastLeaveTimerRef.current = window.setTimeout(() => {
        setToast('');
        setToastLeaving(false);
        toastLeaveTimerRef.current = null;
      }, 180);
    }, 4000);
  };

  const handleAction = (action: CopilotReply['actions'][number]) => {
    if (action.kind === 'navigate') {
      navigate(action.value);
      return;
    }
    if (action.kind === 'scenario') {
      if (!canOperate) {
        showToast('观察员为只读角色，无法切换仿真场景。');
        return;
      }
      const target = SCENARIO_LIST.find((item) => item.key === action.value);
      void Promise.resolve(setScenario(action.value as ScenarioKey)).then((ok) => {
        showToast(
          ok
            ? `已切换仿真场景：${target?.name ?? action.value}，后续回答将基于新场景的实时数据。`
            : '场景切换失败，请检查后端连接后重试。',
        );
      });
      return;
    }
    send(action.value);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send(input);
    }
  };

  const clearChat = () => {
    generationRef.current += 1;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPending(false);
    stickToBottomRef.current = true;
    setMessages([]);
    setLastPipeline(null);
    setLastEvidence([]);
    setLastIntent('');
    setInput('');
    inputRef.current?.focus();
  };

  const totalPipelineMs = lastPipeline?.reduce((sum, step) => sum + step.ms, 0) ?? 0;

  return (
    <div className="copilot-page">
      <PageHeader
        icon={Bot}
        overline="IOT LARGE MODEL · GROUNDED COPILOT"
        title="物联大模型"
        description="理解自然语言，装配时空上下文，调用遥测、图谱与任务工具，给出带证据的决策建议"
        actions={
          <>
            <div className="model-status">
              <StatusPill tone="ai" dot>{llmModel ? '云端推理' : COPILOT_MODEL.mode}</StatusPill>
              <span className="mono">context 32k · tools 6</span>
            </div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={clearChat}>
              <Trash2 size={13} /> 清空会话
            </button>
            <Link className="btn btn--primary btn--sm" to="/graph">
              <Network size={13} /> 知识图谱
            </Link>
          </>
        }
      />

      <section className="copilot-grid">
        <div className="chat-panel">
          <header className="chat-head">
            <div className="chat-head__brand">
              <span className="model-orb"><Bot size={17} /></span>
              <div>
                <strong>{llmModel ?? COPILOT_MODEL.name}</strong>
                <span>面向平安区的时空智能物联助手</span>
              </div>
            </div>
            <div className="chat-head__chips">
              <span>RAG</span>
              <span>KG</span>
              <span>Agent</span>
              <span className="chat-head__live"><i /> 已连接实时数据</span>
            </div>
          </header>

          <div className="chat-scroll" ref={scrollRef} onScroll={handleChatScroll}>
            {!messages.length && (
              <div className="chat-welcome">
                <div className="welcome-visual">
                  <div className="welcome-orbit welcome-orbit--outer" />
                  <div className="welcome-orbit welcome-orbit--inner" />
                  <span className="welcome-core"><Sparkles size={26} /></span>
                  <i className="welcome-node welcome-node--1" />
                  <i className="welcome-node welcome-node--2" />
                  <i className="welcome-node welcome-node--3" />
                </div>
                <span className="overline">SPATIOTEMPORAL COPILOT · {time.hm}</span>
                <h2>问出这片土地的下一步</h2>
                <p>
                  我已装配 {stats.total} 个感知节点、{stats.unmannedActive} 套无人系统与课程知识图谱。
                  当前场景为「{scenario.name}」，所有回答都会绑定实时数据、告警或图谱证据。
                </p>
                <div className="welcome-capabilities">
                  {COPILOT_MODEL.capabilities.map((capability) => (
                    <span key={capability}><Check size={11} /> {capability}</span>
                  ))}
                </div>
                <div className="welcome-suggestions">
                  {COPILOT_SUGGESTIONS.slice(0, 6).map((suggestion, index) => {
                    const Icon = SUGGESTION_ICONS[index % SUGGESTION_ICONS.length];
                    return (
                      <button key={suggestion} type="button" onClick={() => send(suggestion)}>
                        <span className="suggestion-icon"><Icon size={15} /></span>
                        <span>{suggestion}</span>
                        <ArrowUpRight size={13} />
                      </button>
                    );
                  })}
                </div>
                <div className="welcome-note">
                  <ShieldCheck size={13} />
                  {llmModel
                    ? `推理由 ${llmModel} 云端生成，上下文取自本平台实时快照；涉及设备控制的建议均需人工确认。`
                    : '本地演示推理，不连接外部模型；涉及设备控制的建议均需人工确认。'}
                </div>
              </div>
            )}

            {messages.map((message) =>
              message.role === 'user' ? (
                <UserBubble key={message.id} message={message} />
              ) : (
                <AssistantBubble
                  key={message.id}
                  message={message}
                  onAction={handleAction}
                  onAsk={send}
                  onScroll={scrollToBottom}
                />
              ),
            )}

            {pending && (
              <div className="chat-message chat-message--assistant">
                <span className="chat-avatar chat-avatar--ai"><Bot size={15} /></span>
                <div className="chat-bubble-wrap">
                  <div className="chat-meta"><strong>{llmModel ?? 'IoT-Seer'}</strong><span>推理中</span></div>
                  <div className="chat-bubble chat-bubble--assistant chat-thinking">
                    <div className="thinking-dots"><i /><i /><i /></div>
                    <span>正在装配时空上下文 · 检索遥测与告警 · 召回图谱子图</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {lastReply && !pending && (
            <div className="chat-quickfollow" key={lastReply.id}>
              <span className="mono">建议追问</span>
              {lastReply.followups.slice(0, 3).map((followup) => (
                <button key={followup} type="button" onClick={() => send(followup)}>
                  {followup}
                </button>
              ))}
            </div>
          )}

          {toast && (
            <div key={toast} className={`copilot-toast ${toastLeaving ? 'is-leaving' : ''}`}>
              <Activity size={13} /> {toast}
            </div>
          )}

          <div className="chat-input-wrap">
            <div className="chat-input">
              <span className="chat-input__icon"><MessageSquare size={15} /></span>
              <textarea
                ref={inputRef}
                value={input}
                rows={1}
                placeholder="询问实时态势、设备读数、知识概念，或让我生成巡检任务…"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                aria-label="向物联大模型提问"
              />
              <button
                type="button"
                className="chat-send"
                disabled={!input.trim() || pending}
                onClick={() => send(input)}
                aria-label="发送"
              >
                <ArrowUp size={16} />
              </button>
            </div>
            <div className="chat-input__meta">
              <span><Sparkles size={11} /> {llmModel ? `${llmModel} · 云端推理` : `${COPILOT_MODEL.name} · 本地演示推理`}</span>
              <span>Enter 发送 · Shift + Enter 换行</span>
              <span>只读推理 · 指令需人工确认</span>
            </div>
          </div>
        </div>

        <aside className="copilot-side">
          <Panel overline="GROUNDING CONTEXT" title="实时时空上下文" icon={Database} className="ctx-panel">
            <div className="ctx-scenario" style={{ '--sc': scenario.color } as CSSProperties}>
              <div className="ctx-scenario__top">
                <span><i />{scenario.name}</span>
                <em className="mono">{time.time}</em>
              </div>
              <p>{scenario.tagline}</p>
              <div className="ctx-scenario__triggers">
                {scenario.triggers.slice(0, 2).map((trigger) => (
                  <span key={trigger}>{trigger}</span>
                ))}
              </div>
            </div>
            <div className="ctx-grid">
              <div><span>在线节点</span><strong className="mono">{stats.online}<em>/{stats.total}</em></strong></div>
              <div><span>活动告警</span><strong className="mono">{stats.activeAlerts}<em> 条</em></strong></div>
              <div><span>无人系统</span><strong className="mono">{stats.unmannedActive}<em> 套</em></strong></div>
              <div><span>数据质量</span><strong className="mono">{stats.dataQuality}<em>%</em></strong></div>
            </div>
            <div className="ctx-alert">
              <CircleAlert size={14} />
              <div>
                <span>最高优先级事件</span>
                <strong>{alerts.find((alert) => alert.level === 'critical')?.title ?? alerts.find((alert) => alert.status !== '已完成')?.title ?? '当前无活动告警'}</strong>
              </div>
            </div>
          </Panel>

          <Panel
            overline="AGENT TRACE"
            title="推理链与工具调用"
            icon={Workflow}
            className="trace-panel"
            extra={lastPipeline ? <span className="mono trace-total">{totalPipelineMs} ms</span> : <span className="mono detail-text">IDLE</span>}
          >
            {lastPipeline ? (
              <>
                <div className="trace-intent">
                  <span className="overline">INTENT</span>
                  <strong>{lastIntent}</strong>
                </div>
                <div className="trace-steps">
                  {lastPipeline.map((step, index) => (
                    <div className="trace-step" key={`${step.label}-${index}`}>
                      <span className="trace-step__dot"><Check size={9} /></span>
                      <div>
                        <strong>{step.label}</strong>
                        <span>{step.detail}</span>
                      </div>
                      <em className="mono">{step.ms}ms</em>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="trace-empty">
                <Workflow size={24} />
                <strong>发送问题后展示推理链</strong>
                <p>意图识别 → 时空上下文 → 多源检索 → 图谱子图 → 规则校验 → 生成</p>
                <div className="trace-preview">
                  {['意图识别', '时空检索', '图谱推理', '证据绑定'].map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
            )}
            {lastEvidence.length > 0 && (
              <div className="trace-context">
                <span className="overline">RETRIEVED CONTEXT</span>
                {lastEvidence.slice(0, 3).map((evidence) => (
                  <div className="trace-context__row" key={evidence.id}>
                    {evidence.kind === 'graph' ? <Network size={12} /> : evidence.kind === 'alert' ? <TriangleAlert size={12} /> : evidence.kind === 'document' ? <BookOpen size={12} /> : <Gauge size={12} />}
                    <span>{evidence.title}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel overline="GUARDRAILS" title="安全与可信边界" icon={ShieldCheck} className="guard-panel">
            <div className="guard-list">
              <div><Check size={12} /><span>所有结论绑定数据证据</span><em>GROUNDED</em></div>
              <div><Check size={12} /><span>指令不直接下发真实设备</span><em>HUMAN-IN-LOOP</em></div>
              <div><Check size={12} /><span>敏感数据分级与脱敏</span><em>PRIVACY</em></div>
              <div><Check size={12} /><span>图谱来源可追溯到知识域</span><em>TRACEABLE</em></div>
            </div>
            <div className="guard-note">
              <ShieldCheck size={13} />
              <p>
                {llmModel
                  ? `回答由 ${llmModel} 云端生成，证据链绑定本地检索与课程知识库；断网或未配置密钥时自动回落本地规则引擎。`
                  : '演示引擎基于本地规则与课程知识库生成回答；配置云端模型后自动切换。'}
              </p>
            </div>
          </Panel>
        </aside>
      </section>
    </div>
  );
}
