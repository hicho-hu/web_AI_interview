import { useEffect } from 'react';

export function useMobileViewport() {
  useEffect(() => {
    if (document.documentElement.dataset.device !== 'phone') return;
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let width = window.innerWidth;
    let restingHeight = window.innerHeight;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = viewport?.height ?? window.innerHeight;
        root.style.setProperty('--app-viewport-height', `${height}px`);
        const editing = document.activeElement?.matches('input:not([type="checkbox"]), textarea, select');
        // Chrome can resize both viewports when the keyboard opens. Remember the
        // height before editing; a width change resets it for phone rotation.
        if (window.innerWidth !== width) {
          width = window.innerWidth;
          restingHeight = window.innerHeight;
        }
        if (!editing) restingHeight = Math.max(restingHeight, window.innerHeight);
        root.dataset.keyboardOpen = String(
          !!editing && Math.max(restingHeight, window.innerHeight) - height > 150,
        );
      });
    };
    update();
    viewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      delete root.dataset.keyboardOpen;
      root.style.removeProperty('--app-viewport-height');
    };
  }, []);
}
