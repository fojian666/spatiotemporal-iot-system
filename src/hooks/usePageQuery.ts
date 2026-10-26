import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

// 页内筛选替换当前记录；跨页跳转仍由 Link 创建历史记录，返回时可恢复上下文。
export function usePageQuery() {
  const [params, setParams] = useSearchParams();
  const updateQuery = useCallback((patch: Record<string, string | null>) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(patch).forEach(([key, value]) => {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      });
      return next;
    }, { replace: true });
  }, [setParams]);
  return [params, updateQuery] as const;
}
