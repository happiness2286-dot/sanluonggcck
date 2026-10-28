import { useEffect, useState } from 'react';

const NAV_EVENT = 'gcck:navigate';

export function getBasePath(): string {
  if (typeof window === 'undefined') return '';
  const pathname = window.location.pathname;
  if (pathname.startsWith('/sanluonggcck')) {
    return '/sanluonggcck';
  }
  return '';
}

export function normalizePath(path: string): string {
  const base = getBasePath();
  if (base && path.startsWith(base)) {
    const stripped = path.slice(base.length);
    return stripped ? (stripped.startsWith('/') ? stripped : `/${stripped}`) : '/';
  }
  return path || '/';
}

export function navigateTo(path: string): void {
  if (typeof window === 'undefined') return;
  const base = getBasePath();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const fullPath = base ? `${base}${normalized}` : normalized;
  if (window.location.pathname === fullPath) return;
  window.history.pushState({}, '', fullPath);
  window.dispatchEvent(new CustomEvent(NAV_EVENT));
}

export function useLocationPath(): string {
  const [pathname, setPathname] = useState<string>(() =>
    typeof window !== 'undefined' ? normalizePath(window.location.pathname) : '/worker'
  );

  useEffect(() => {
    const sync = () => setPathname(normalizePath(window.location.pathname));
    window.addEventListener('popstate', sync);
    window.addEventListener(NAV_EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(NAV_EVENT, sync);
    };
  }, []);

  return pathname;
}
