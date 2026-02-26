import { exec } from "child_process";
exec("npm run compile", (error, stdout, stderr) => {
  if (error) {
    if (stdout.includes("components/ActivityClassModal.tsx")) {
       console.log("ActivityClassModal has compile errors:");
       console.log(stdout.split('\n').filter(line => line.includes('components/ActivityClassModal.tsx') || line.trim().startsWith("TS")).join('\n'));
    } else {
       console.log("No compile errors in ActivityClassModal.");
    }
  } else {
    console.log("Compile clean.");
  }
});
