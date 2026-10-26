import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const positions = new Map<string, { top: number; left: number }>();

// 在页面内容挂载后恢复，避免路由懒加载骨架尚未撑开时把位置截成 0。
export function usePageScroll(ready = true) {
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigation = useNavigationType();
  const entry = useRef({ key: location.key, navigation });
  entry.current = { key: location.key, navigation };

  useLayoutEffect(() => {
    if (!ready) return;
    const container = ref.current?.closest<HTMLElement>('.app-content');
    if (!container) return;
    const saved = entry.current.navigation === 'POP' ? positions.get(entry.current.key) : undefined;
    container.scrollTo({ top: saved?.top ?? 0, left: saved?.left ?? 0, behavior: 'instant' });
    return () => {
      positions.set(entry.current.key, { top: container.scrollTop, left: container.scrollLeft });
      if (positions.size > 50) positions.delete(positions.keys().next().value!);
    };
  }, [ready]);
  return ref;
}
