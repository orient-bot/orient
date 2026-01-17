import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function useOriActivation() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!location.search) return;

    const params = new URLSearchParams(location.search);
    const highlightSelector = params.get('ori_highlight');
    const scrollSelector = params.get('ori_scroll');
    const openPanel = params.get('ori_open');
    const tooltip = params.get('ori_tooltip');

    if (highlightSelector) {
      const el = document.querySelector(highlightSelector);
      if (el) {
        el.classList.add('ori-highlight');
        window.setTimeout(() => el.classList.remove('ori-highlight'), 3000);
      }
    }

    if (scrollSelector) {
      document
        .querySelector(scrollSelector)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    if (openPanel) {
      window.dispatchEvent(new CustomEvent('ori:open-panel', { detail: openPanel }));
    }

    if (tooltip) {
      const [selector, message] = tooltip.split(':');
      if (selector && message) {
        window.dispatchEvent(
          new CustomEvent('ori:tooltip', { detail: { selector, message } })
        );
      }
    }

    if ([highlightSelector, scrollSelector, openPanel, tooltip].some(Boolean)) {
      const cleanParams = new URLSearchParams();
      params.forEach((value, key) => {
        if (!key.startsWith('ori_')) {
          cleanParams.set(key, value);
        }
      });
      navigate({ search: cleanParams.toString() }, { replace: true });
    }
  }, [location.search, navigate]);
}
