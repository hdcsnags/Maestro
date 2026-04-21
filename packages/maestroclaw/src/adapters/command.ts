import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";

interface CliInvocation {
  command: string;
  args: string[];
}

function resolveNodeEntryFromCmdShim(cmdShim: string): string | null {
  try {
    const shimContents = readFileSync(cmdShim, "utf-8");
    const match = shimContents.match(/"%dp0%\\([^"]+\.js)" %\*/i);
    if (!match) return null;

    const relativeEntry = match[1].split("\\");
    return join(dirname(cmdShim), ...relativeEntry);
  } catch {
    return null;
  }
}

async function resolvePowerShellScript(commandName: string): Promise<string | null> {
  return await new Promise<string | null>((resolve) => {
    let stdout = "";

    const proc = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `(Get-Command ${commandName} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)`,
      ],
      {
        shell: false,
        timeout: 5000,
        env: { ...process.env },
      },
    );

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.on("close", (code) => {
      const source = stdout.trim();
      resolve(code === 0 && source.length > 0 ? source : null);
    });

    proc.on("error", () => resolve(null));
  });
}

export async function resolveCliInvocation(commandName: string): Promise<CliInvocation | null> {
  if (process.platform !== "win32") {
    return { command: commandName, args: [] };
  }

  const appData = process.env.APPDATA;
  const cmdShim = appData ? join(appData, "npm", `${commandName}.cmd`) : null;
  if (cmdShim && existsSync(cmdShim)) {
    const nodeEntry = resolveNodeEntryFromCmdShim(cmdShim);
    if (nodeEntry) {
      return {
        command: process.execPath,
        args: [nodeEntry],
      };
    }
  }

  const source = await resolvePowerShellScript(commandName);
  if (!source) return null;

  if (source.toLowerCase().endsWith(".ps1")) {
    return {
      command: "powershell.exe",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", source],
    };
  }

  return {
    command: source,
    args: [],
  };
}

export function buildCliArguments(invocation: CliInvocation, cliArgs: string[]): string[] {
  return [...invocation.args, ...cliArgs];
}
