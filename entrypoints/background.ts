export default defineBackground(() => {
  console.log('[BetterLectio] Background script loaded');

  // Handle extension icon click - open settings modal
  // Use action (MV3) or browserAction (MV2/Firefox) for cross-browser support
  const actionApi = browser.action ?? (browser as any).browserAction;
  actionApi?.onClicked.addListener(async (tab: { id?: number }) => {
    if (!tab.id) return;

    try {
      // Try sending message to the content script on the active tab
      await browser.tabs.sendMessage(tab.id, { action: 'openSettings' });
    } catch {
      // Content script not running (not on lectio.dk or not loaded yet)
      await browser.tabs.create({ url: 'https://www.lectio.dk/' });
    }
  });
});
