import { render as preactRender, type ComponentChild } from 'preact';
import { I18nProvider } from './provider';

type RenderTarget = Parameters<typeof preactRender>[1];

/**
 * Drop-in replacement for `preact`'s `render` that wraps every root in `<I18nProvider>`,
 * so any component reached via `useTranslation()` resolves a real i18n context.
 *
 * Each injected page in BetterLectio mounts its own Preact root into a different DOM
 * container; Context does not cross roots, so this wrapper is the single source of
 * i18n truth across all of them.
 */
export function render(vnode: ComponentChild, container: RenderTarget): void {
  preactRender(<I18nProvider>{vnode as Parameters<typeof preactRender>[0]}</I18nProvider>, container);
}
