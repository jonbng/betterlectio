const ADMIN_API_ORIGIN = (import.meta.env.VITE_ADMIN_API_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
const HANDOFF_REQUEST = 'betterlectio:admin-handoff';
const HANDOFF_RESULT = 'betterlectio:admin-handoff-result';

interface HandoffRequest {
  type: typeof HANDOFF_REQUEST;
  requestId: string;
  token: string;
}

export default defineContentScript({
  matches: [`${ADMIN_API_ORIGIN}/*`],
  runAt: 'document_start',
  main() {
    window.addEventListener('message', (event) => {
      if (
        event.source !== window ||
        event.origin !== ADMIN_API_ORIGIN ||
        event.data?.type !== HANDOFF_REQUEST
      ) return;

      const request = event.data as HandoffRequest;
      if (!/^[0-9a-f-]{36}$/i.test(request.requestId) || !/^[0-9a-f]{64}$/.test(request.token)) {
        return;
      }

      void browser.runtime.sendMessage({
        type: 'bl-admin:redeem-handoff',
        token: request.token,
      }).then((result: { ok?: boolean; error?: string } | undefined) => {
        window.postMessage({
          type: HANDOFF_RESULT,
          requestId: request.requestId,
          ok: result?.ok === true,
          error: result?.error,
        }, ADMIN_API_ORIGIN);
      }).catch(() => {
        window.postMessage({
          type: HANDOFF_RESULT,
          requestId: request.requestId,
          ok: false,
          error: 'The admin extension could not process the handoff',
        }, ADMIN_API_ORIGIN);
      });
    });
  },
});
