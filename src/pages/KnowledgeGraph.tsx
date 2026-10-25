import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  GitBranch,
  Network,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import type { EChartsOption } from '../lib/echarts';
import { chartPalette, darkenHex, useTheme } from '../theme';
import { PageHeader } from '../components/Shell';
import { EChart } from '../components/charts';
import { Panel, StatusPill } from '../components/ui';
import {
  CATEGORY_META,
  GRAPH_STATS,
  KNOWLEDGE_LINKS,
  KNOWLEDGE_NODES,
  findShortestPath,
  getNeighbors,
  getNode,
  type KnowledgeCategory,
  type KnowledgeNode,
} from '../data/knowledge';

const CATEGORY_ORDER: KnowledgeCategory[] = [
  'perception',
  'network',
  'spacetime',
  'platform',
  'intelligence',
  'application',
  'security',
];

const CLUSTER_POSITIONS: Record<KnowledgeCategory, { x: number; y: number }> = {
  perception: { x: -520, y: -220 },
  network: { x: -540, y: 200 },
  spacetime: { x: -180, y: -330 },
  platform: { x: 230, y: -300 },
  intelligence: { x: 560, y: -130 },
  application: { x: 470, y: 260 },
  security: { x: -100, y: 330 },
};

const HUB_IDS = new Set(['root', 'spacetime', 'kg', 'llm', 'sensor', 'gateway', 'access', 'mqtt', 'water', 'inspection', 'agent', 'fire']);
const PATH_OPTIONS = ['root', 'sensor', 'mqtt', 'gateway', 'gis', 'sdb', 'spacetime', 'twin', 'kg', 'llm', 'rag', 'agent', 'water', 'inspection', 'fire', 'emergency'];

const degrees = new Map<string, number>();
KNOWLEDGE_NODES.forEach((item) => degrees.set(item.id, 0));
KNOWLEDGE_LINKS.forEach((link) => {
  degrees.set(link.source, (degrees.get(link.source) ?? 0) + 1);
  degrees.set(link.target, (degrees.get(link.target) ?? 0) + 1);
});

const nodePositions = new Map<string, { x: number; y: number }>();
nodePositions.set('root', { x: 0, y: 0 });
CATEGORY_ORDER.forEach((category, categoryIndex) => {
  const center = CLUSTER_POSITIONS[category];
  const members = KNOWLEDGE_NODES.filter((item) => item.category === category && item.id !== 'root');
  members.forEach((item, index) => {
    const angle = index * 2.399 + categoryIndex * 0.9;
    const radius = 62 + Math.sqrt(index) * 48;
    let x = center.x + Math.cos(angle) * radius;
    let y = center.y + Math.sin(angle) * radius * 0.68;
    if (HUB_IDS.has(item.id)) {
      const pull = 0.72;
      x = center.x + (x - center.x) * pull;
      y = center.y + (y - center.y) * pull;
    }
    nodePositions.set(item.id, { x, y });
  });
});

const nodeColor = (node: KnowledgeNode) => CATEGORY_META[node.category].color;

// 浅色主题下加深分类色，保证标签在白底可读
function themeAwareLabelColor(theme: 'dark' | 'light', color: string) {
  return theme === 'light' ? darkenHex(color, 0.55) : color;
}

function resolvePathLinks(path: KnowledgeNode[]) {
  const pairs = new Set<string>();
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = path[index].id;
    const b = path[index + 1].id;
    pairs.add(`${a}|${b}`);
    pairs.add(`${b}|${a}`);
  }
  return pairs;
}

export function KnowledgeGraphPage() {
  const theme = useTheme();
  const palette = useMemo(() => chartPalette(), [theme]);
  const [searchParams] = useSearchParams();
  const focus = searchParams.get('focus');
  const [selectedId, setSelectedId] = useState(focus && getNode(focus) ? focus : 'root');
  const [hidden, setHidden] = useState<Set<KnowledgeCategory>>(new Set());
  const [search, setSearch] = useState('');
  const [pathFrom, setPathFrom] = useState('sensor');
  const [pathTo, setPathTo] = useState('llm');
  const [path, setPath] = useState<KnowledgeNode[] | null>(null);
  const [pathError, setPathError] = useState('');

  useEffect(() => {
    if (focus && getNode(focus)) setSelectedId(focus);
  }, [focus]);

  const selected = getNode(selectedId) ?? getNode('root')!;
  const neighbors = getNeighbors(selected.id);
  const pathPairs = path ? resolvePathLinks(path) : new Set<string>();
  const pathIds = new Set((path ?? []).map((item) => item.id));

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return KNOWLEDGE_NODES.filter(
      (item) => item.name.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q) || item.id.includes(q),
    ).slice(0, 6);
  }, [search]);

  const graphOption = useMemo<EChartsOption>(() => {
    const q = search.trim().toLowerCase();
    const matchIds = new Set(searchResults.map((item) => item.id));
    const selectedNeighbors = new Set(neighbors.map((item) => item.node.id));
    selectedNeighbors.add(selected.id);

    const nodes = [
      ...KNOWLEDGE_NODES.map((item) => {
        const position = nodePositions.get(item.id) ?? { x: 0, y: 0 };
        const isRoot = item.id === 'root';
        const isSelected = item.id === selected.id;
        const isNeighbor = selectedNeighbors.has(item.id);
        const isPath = pathIds.has(item.id);
        const isSearchMatch = matchIds.has(item.id);
        const isDimmed = hidden.has(item.category) || (Boolean(q) && !isSearchMatch);
        const color = nodeColor(item);
        const labelColor = themeAwareLabelColor(theme, color);
        const degree = degrees.get(item.id) ?? 0;
        const size = isRoot ? 34 : HUB_IDS.has(item.id) ? 20 + Math.min(9, degree * 0.6) : 9 + Math.min(11, degree * 1.35);
        const borderColor = isPath ? '#8affc1' : isSelected ? palette.nodeSelect : isSearchMatch ? '#ffe28a' : `${labelColor}88`;
        return {
          id: item.id,
          nodeId: item.id,
          name: item.name,
          x: position.x,
          y: position.y,
          category: CATEGORY_ORDER.indexOf(item.category),
          symbolSize: size,
          value: degree,
          itemStyle: {
            color: isDimmed ? `${color}2b` : color,
            borderColor,
            borderWidth: isSelected || isPath ? 2.4 : isNeighbor ? 1.2 : 0.5,
            shadowBlur: isSelected || isSearchMatch ? 24 : isPath ? 16 : 6,
            shadowColor: isSelected ? color : isPath ? '#23e6b0' : `${color}66`,
            opacity: isDimmed ? 0.22 : 1,
          },
          label: {
            show: true,
            position: 'right',
            distance: 5,
            color: isDimmed ? palette.labelDim : isSelected ? palette.nodeSelect : isNeighbor ? labelColor : labelColor,
            textBorderColor: palette.halo,
            textBorderWidth: 2,
            fontSize: isRoot || HUB_IDS.has(item.id) ? 10.5 : 9.2,
            fontWeight: isRoot || isSelected ? 600 : 400,
            opacity: isDimmed ? 0.25 : 1,
          },
          emphasis: {
            itemStyle: { borderColor: palette.nodeSelect, borderWidth: 2, shadowBlur: 26 },
            label: { color: palette.nodeSelect, fontSize: 11, textBorderColor: palette.halo, textBorderWidth: 2 },
          },
        };
      }),
      ...CATEGORY_ORDER.map((category) => {
        const center = CLUSTER_POSITIONS[category];
        const meta = CATEGORY_META[category];
        const labelY = center.y - 88;
        const hiddenCategory = hidden.has(category);
        return {
          id: `__cat_${category}`,
          nodeId: '',
          name: meta.label,
          x: center.x,
          y: labelY,
          category: CATEGORY_ORDER.indexOf(category),
          symbolSize: 0.1,
          value: 0,
          itemStyle: { color: 'transparent', opacity: 0 },
          label: {
            show: !hiddenCategory,
            position: 'inside',
            formatter: meta.label,
            color: meta.color,
            fontSize: 10,
            fontWeight: 600,
            backgroundColor: palette.tipBg,
            borderColor: `${meta.color}44`,
            borderWidth: 1,
            borderRadius: 4,
            padding: [4, 8],
          },
          silent: true,
        };
      }),
    ];

    const links = KNOWLEDGE_LINKS.map((item) => {
      const sourceNode = getNode(item.source)!;
      const targetNode = getNode(item.target)!;
      const sourceDimmed = hidden.has(sourceNode.category);
      const targetDimmed = hidden.has(targetNode.category);
      const pair = `${item.source}|${item.target}`;
      const isPathEdge = pathPairs.has(pair);
      const isAdjacent = item.source === selected.id || item.target === selected.id;
      const searchDim = Boolean(q) && !matchIds.has(item.source) && !matchIds.has(item.target);
      const color = isPathEdge ? '#5fffb1' : isAdjacent ? '#7defff' : themeAwareLabelColor(theme, nodeColor(sourceNode));
      return {
        source: item.source,
        target: item.target,
        value: item.rel,
        lineStyle: {
          color,
          width: isPathEdge ? 2.6 : isAdjacent ? 1.4 : 0.7,
          opacity: sourceDimmed || targetDimmed ? 0.025 : searchDim ? 0.04 : isPathEdge ? 0.92 : isAdjacent ? 0.48 : 0.17,
          curveness: 0.08,
        },
        emphasis: { lineStyle: { width: 1.8, opacity: 0.75 } },
      };
    });

    return {
      backgroundColor: 'transparent',
      animationDuration: 700,
      animationEasing: 'cubicOut',
      animationDurationUpdate: 460,
      animationEasingUpdate: 'cubicOut',
      tooltip: {
        backgroundColor: palette.tipBg,
        borderColor: palette.tipBorder,
        borderWidth: 1,
        padding: [10, 12],
        textStyle: { color: palette.tipText, fontSize: 11 },
        confine: true,
        // confine 在顶部边缘节点上不生效（tooltip 上翻超出面板顶部），
        // 显式接管定位：优先指针右下，越界时翻转并钳制在画布内
        position: (point: number[], _p: unknown, _d: unknown, _r: unknown, size: unknown) => {
          const s = size as { viewSize: number[]; contentSize: number[] };
          const [vw, vh] = s.viewSize;
          // 翻转瞬间 contentSize 可能测得偏小，用保守下限保证一次翻转到位
          const cw = Math.max(s.contentSize[0], 280);
          const ch = Math.max(s.contentSize[1], 90);
          let x = point[0] + 16;
          let y = point[1] + 14;
          if (x + cw > vw - 8) x = point[0] - cw - 14;
          if (y + ch > vh - 8) y = point[1] - ch - 14;
          x = Math.min(Math.max(x, 8), Math.max(8, vw - cw - 8));
          y = Math.min(Math.max(y, 8), Math.max(8, vh - ch - 8));
          return [x, y];
        },
        formatter: (params: unknown) => {
          const data = (params as { data?: { nodeId?: string; name?: string } }).data;
          if (!data?.nodeId) return '';
          const node = getNode(data.nodeId);
          if (!node) return '';
          const meta = CATEGORY_META[node.category];
          return `<div style="max-width:min(250px, 60vw);white-space:normal;overflow-wrap:anywhere"><div style="color:${themeAwareLabelColor(theme, meta.color)};font-size:10px;letter-spacing:.12em;margin-bottom:4px">${meta.label}</div><div style="font-size:13px;font-weight:600;color:${palette.tipText};margin-bottom:4px">${node.name}</div><div style="color:${palette.label};line-height:1.6;white-space:normal;overflow-wrap:anywhere">${node.desc.slice(0, 82)}…</div><div style="margin-top:6px;color:${palette.dim};font-size:10px">关联度 ${degrees.get(node.id) ?? 0} · 点击查看知识子图</div></div>`;
        },
      },
      series: [
        {
          type: 'graph',
          layout: 'none',
          roam: true,
          draggable: false,
          symbol: 'circle',
          data: nodes,
          links,
          categories: CATEGORY_ORDER.map((category) => ({
            name: CATEGORY_META[category].label,
            itemStyle: { color: CATEGORY_META[category].color },
          })),
          labelLayout: { hideOverlap: true },
          lineStyle: { color: 'source', curveness: 0.08 },
          emphasis: { focus: 'adjacency', lineStyle: { width: 1.8 } },
          scaleLimit: { min: 0.35, max: 2.6 },
        },
      ],
    } as EChartsOption;
  }, [hidden, pathIds, pathPairs, search, searchResults, selected.id, neighbors, palette, theme]);

  const toggleCategory = (category: KnowledgeCategory) => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else if (next.size < CATEGORY_ORDER.length - 1) next.add(category);
      return next;
    });
  };

  const runPath = () => {
    const result = findShortestPath(pathFrom, pathTo);
    setPath(result);
    setPathError(result ? '' : '两个实体在当前知识图谱中不连通');
  };

  const setAsPathStart = (id: string) => {
    setPathFrom(id);
    if (pathTo === id) {
      const alternative = PATH_OPTIONS.find((item) => item !== id) ?? 'root';
      setPathTo(alternative);
    }
    setPath(null);
    setPathError('');
  };

  return (
    <div className="kg-page">
      <PageHeader
        icon={Network}
        overline="IOT KNOWLEDGE GRAPH · SEMANTIC SPACE"
        title="物联网知识图谱"
        description="把设备、协议、时空能力、算法与应用组织为可推理的语义网络"
        actions={
          <>
            <div className="kg-stats">
              <div><strong className="mono">{GRAPH_STATS.nodes}</strong><span>实体</span></div>
              <div><strong className="mono">{GRAPH_STATS.links}</strong><span>关系</span></div>
              <div><strong className="mono">{GRAPH_STATS.categories}</strong><span>知识域</span></div>
              <div><strong className="mono">{GRAPH_STATS.sources}</strong><span>来源</span></div>
            </div>
            <Link className="btn btn--primary" to={`/copilot?q=${encodeURIComponent('知识图谱如何支撑大模型？')}`}>
              <Sparkles size={14} /> 让大模型解读
            </Link>
          </>
        }
      />

      <section className="kg-grid">
        <aside className="kg-left">
          <Panel overline="KNOWLEDGE DOMAINS" title="知识域筛选" icon={BookOpen} className="kg-domains">
            <div className="kg-domain-list">
              {CATEGORY_ORDER.map((category) => {
                const meta = CATEGORY_META[category];
                const count = KNOWLEDGE_NODES.filter((item) => item.category === category).length;
                const isHidden = hidden.has(category);
                return (
                  <button
                    key={category}
                    type="button"
                    className={`kg-domain ${isHidden ? 'is-hidden' : ''}`}
                    onClick={() => toggleCategory(category)}
                  >
                    <i style={{ background: meta.color }} />
                    <span>
                      <strong>{meta.label}</strong>
                      <em>{category.toUpperCase()}</em>
                    </span>
                    <b className="mono">{count}</b>
                  </button>
                );
              })}
            </div>
            <div className="kg-domain-foot">
              <button type="button" onClick={() => setHidden(new Set())}>重置视图</button>
              <span>点击知识域进行显隐</span>
            </div>
          </Panel>

          <Panel overline="PATH REASONING" title="最短关系路径" icon={GitBranch} className="kg-path">
            <div className="path-selects">
              <label>
                <span>起点</span>
                <select value={pathFrom} onChange={(event) => { setPathFrom(event.target.value); setPath(null); }}>
                  {PATH_OPTIONS.map((id) => (
                    <option key={id} value={id}>{getNode(id)?.name}</option>
                  ))}
                </select>
              </label>
              <span className="path-arrow"><ChevronRight size={14} /></span>
              <label>
                <span>终点</span>
                <select value={pathTo} onChange={(event) => { setPathTo(event.target.value); setPath(null); }}>
                  {PATH_OPTIONS.map((id) => (
                    <option key={id} value={id}>{getNode(id)?.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <button type="button" className="btn btn--primary btn--block" onClick={runPath}>
              <GitBranch size={13} /> 推演语义路径
            </button>
            {pathError && <p className="path-error">{pathError}</p>}
            {path && (
              <div className="path-result">
                <div className="path-result__head">
                  <span className="overline">PATH FOUND · {path.length} HOPS</span>
                  <button type="button" onClick={() => setPath(null)}><X size={12} /></button>
                </div>
                <div className="path-chain">
                  {path.map((item, index) => (
                    <span key={item.id} className="path-chain__item">
                      <button
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        style={{ '--node-color': CATEGORY_META[item.category].color } as CSSProperties}
                      >
                        {item.name}
                      </button>
                      {index < path.length - 1 && <ArrowRight size={11} />}
                    </span>
                  ))}
                </div>
                <p>系统通过实体关系完成跨知识域推理，而不是单点关键词匹配。</p>
              </div>
            )}
            <div className="kg-method-note">
              <StatusPill tone="ai" dot>图谱推理</StatusPill>
              <p>教材与论文可按“章节切分 → 概念/关系抽取 → 实体对齐”增量接入，形成可追溯的知识来源。</p>
            </div>
          </Panel>
        </aside>

        <Panel
          overline="SEMANTIC CONSTELLATION"
          title="语义星图"
          icon={Network}
          className="kg-graph-panel"
          extra={
            <div className="graph-tools">
              <label className="search-box search-box--graph">
                <Search size={13} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="检索实体 / 概念 / 关系"
                  aria-label="检索知识图谱"
                />
                {search && (
                  <button type="button" className="search-clear" onClick={() => setSearch('')} aria-label="清空搜索">
                    <X size={11} />
                  </button>
                )}
              </label>
              <span className="mono graph-hint">SCROLL TO ZOOM</span>
            </div>
          }
        >
          <div className="graph-shell">
            <EChart
              option={graphOption}
              height="100%"
              onClick={(params) => {
                const data = (params as unknown as { data?: { nodeId?: string } }).data;
                if (data?.nodeId) setSelectedId(data.nodeId);
              }}
            />
            {search && (
              <div className="graph-search-results">
                <span className="overline">SEARCH RESULTS · {searchResults.length}</span>
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(item.id);
                      setSearch('');
                    }}
                  >
                    <i style={{ background: CATEGORY_META[item.category].color }} />
                    <span>
                      <strong>{item.name}</strong>
                      <em>{CATEGORY_META[item.category].label}</em>
                    </span>
                    <ChevronRight size={12} />
                  </button>
                ))}
                {!searchResults.length && <p>未找到匹配实体</p>}
              </div>
            )}
            <div className="graph-domain-legend">
              {CATEGORY_ORDER.map((category) => (
                <span key={category} style={{ '--cat': CATEGORY_META[category].color } as CSSProperties}>
                  <i />{CATEGORY_META[category].short}
                </span>
              ))}
            </div>
            <div className="graph-legend">
              <span><i className="graph-dot graph-dot--selected" />当前实体</span>
              <span><i className="graph-dot graph-dot--path" />推理路径</span>
              <span className="mono">NODE SIZE = DEGREE</span>
            </div>
            <div className="graph-footnote mono">CLICK NODE TO INSPECT · DRAG TO PAN</div>
          </div>
        </Panel>

        <aside className="kg-right">
          <Panel
            overline="ENTITY INSPECTOR"
            title="实体详情"
            icon={BookOpen}
            className="kg-detail"
            extra={
              <span className="kg-category-badge" style={{ '--node-color': CATEGORY_META[selected.category].color } as CSSProperties}>
                {CATEGORY_META[selected.category].label}
              </span>
            }
          >
            <div className="kg-detail__body" key={selected.id}>
            <div className="kg-detail__head">
              <div className="kg-detail__glyph" style={{ '--node-color': nodeColor(selected) } as CSSProperties}>
                {selected.name.slice(0, 1)}
              </div>
              <div>
                <h3>{selected.name}</h3>
                <span className="mono">{selected.id.toUpperCase()} · {selected.source}</span>
              </div>
            </div>
            <p className="kg-detail__desc">{selected.desc}</p>

            {selected.props && (
              <div className="kg-props">
                {Object.entries(selected.props).map(([key, value]) => (
                  <div key={key}>
                    <span>{key}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            )}

            {path && (
              <div className="kg-detail__path">
                <span className="overline">ACTIVE REASONING PATH</span>
                <div>
                  {path.map((item, index) => (
                    <span key={item.id}>
                      <button type="button" onClick={() => setSelectedId(item.id)}>{item.name}</button>
                      {index < path.length - 1 && <ArrowRight size={10} />}
                    </span>
                  ))}
                </div>
                <button type="button" className="kg-path-clear" onClick={() => setPath(null)}>清除路径</button>
              </div>
            )}

            <div className="kg-relations">
              <div className="kg-relations__head">
                <span className="overline">RELATIONS · {neighbors.length}</span>
                <span className="mono">DEGREE {degrees.get(selected.id) ?? 0}</span>
              </div>
              <div className="kg-relation-list">
                {neighbors.map((neighbor) => (
                  <button
                    key={`${neighbor.direction}-${neighbor.node.id}`}
                    type="button"
                    onClick={() => setSelectedId(neighbor.node.id)}
                  >
                    <span className="kg-relation__dir">{neighbor.direction === 'out' ? '→' : '←'}</span>
                    <span className="kg-relation__body">
                      <strong style={{ color: CATEGORY_META[neighbor.node.category].color }}>{neighbor.node.name}</strong>
                      <em>{neighbor.rel}</em>
                    </span>
                    <ChevronRight size={12} />
                  </button>
                ))}
              </div>
            </div>

            <div className="kg-detail__actions">
              <button type="button" className="btn btn--sm" onClick={() => setAsPathStart(selected.id)}>
                <GitBranch size={12} /> 从这里推理
              </button>
              <Link
                className="btn btn--sm btn--ai"
                to={`/copilot?q=${encodeURIComponent(`请用知识图谱解释「${selected.name}」在时空智能物联网系统中的作用，并说明它与其他概念的关系。`)}`}
              >
                <Sparkles size={12} /> 让大模型解释
              </Link>
            </div>
            </div>
          </Panel>
        </aside>
      </section>
    </div>
  );
}
