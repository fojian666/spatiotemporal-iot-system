import { render, fireEvent } from '@testing-library/react';
import { MemoryRouter, Link, Routes, Route, useNavigate } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { usePageScroll } from '../../src/hooks/usePageScroll';

it('restores a POP entry after its page mounts and resets a new page', () => {
  const scroll = vi.fn(function(this: HTMLElement, options: ScrollToOptions) { this.scrollTop = options.top ?? 0; });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scroll });
  function First() { const ref = usePageScroll(); return <div ref={ref}><Link to="/next">next</Link></div>; }
  function Back() { const navigate = useNavigate(); const ref = usePageScroll(); return <div ref={ref}><button onClick={() => navigate(-1)}>back</button></div>; }
  const { container, getByText } = render(<MemoryRouter initialEntries={['/']}><div className="app-content"><Routes><Route path="/" element={<First />} /><Route path="/next" element={<Back />} /></Routes></div></MemoryRouter>);
  const content = container.querySelector<HTMLElement>('.app-content')!;
  content.scrollTop = 480;
  fireEvent.click(getByText('next'));
  expect(content.scrollTop).toBe(0);
  fireEvent.click(getByText('back'));
  expect(content.scrollTop).toBe(480);
});
