import { exec } from "child_process";
exec("npm run compile", (error, stdout, stderr) => {
  if (error) {
    if (stdout.includes("components/ActivityDetailOverlay.tsx")) {
       console.log("ActivityDetailOverlay has compile errors:");
       console.log(stdout.split('\n').filter(line => line.includes('components/ActivityDetailOverlay.tsx') || line.trim().startsWith("TS")).join('\n'));
    } else {
       console.log("No compile errors in ActivityDetailOverlay.");
    }
  } else {
    console.log("Compile clean.");
  }
});
