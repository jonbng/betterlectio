export default defineContentScript({
  matches: ["*://www.lectio.dk/lectio/*/default.aspx*"],
  runAt: "document_start",
  main() {
    const newUrl = window.location.href.replace("default.aspx", "forside.aspx");
    console.log("[BetterLectio] Redirecting from default.aspx to forside.aspx");
    window.location.replace(newUrl);
  },
});
