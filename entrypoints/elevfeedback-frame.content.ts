import {
  ELEVFEEDBACK_FRAME_NAME,
  parentPrefersDark,
  prepareElevfeedbackIframeDocument,
} from "@/lib/elevfeedback-frame";

/**
 * Runs in the Elevfeedback editor iframe only (`window.name` survives Gem/Nyt
 * postbacks). Injects chrome-hiding CSS at document_start so Lectio's master
 * menu / subnav never paint. Do not use srcdoc — CKEditor and ASP.NET save
 * need the live Lectio document.
 */
export default defineContentScript({
  matches: ["*://*.lectio.dk/*"],
  allFrames: true,
  runAt: "document_start",
  main() {
    if (window.name !== ELEVFEEDBACK_FRAME_NAME) return;

    let scheduled = false;
    let stopped = false;
    const strip = () => {
      scheduled = false;
      if (stopped) return;
      prepareElevfeedbackIframeDocument(document, parentPrefersDark());
    };
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(strip);
    });

    const start = () => {
      if (stopped || !document.documentElement) return;
      observer.observe(document.documentElement, { childList: true, subtree: true });
      strip();
    };
    const stop = () => {
      strip();
      stopped = true;
      observer.disconnect();
    };

    if (document.documentElement) start();
    else document.addEventListener("readystatechange", start, { once: true });

    // The observer is only needed while the parser builds the document. Once
    // load fires, CSS handles later CKEditor dialogs without repeatedly walking
    // every mutation the editor produces.
    window.addEventListener("load", stop, { once: true });
    window.setTimeout(stop, 10_000);
  },
});
