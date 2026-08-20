import { spawn } from "child_process";
import path from "path";

export interface GBrainResult {
  slug: string;
  title?: string;
  score?: number;
  chunk_text?: string;
  [key: string]: unknown;
}

function runGBrain(
  args: string[],
  input?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const gbrainCli = path.resolve(
      process.cwd(),
      "../gbrain/src/cli.ts"
    );

    const child = spawn(
      "bun",
      [gbrainCli, ...args],
      {
        windowsHide: true,
        shell: false,
      }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `GBrain failed (${code}): ${stderr || stdout}`
          )
        );
        return;
      }

      resolve(stdout);
    });

    if (input) {
      child.stdin.write(input);
    }

    child.stdin.end();
  });
}

export async function storeInGBrain(
  slug: string,
  title: string,
  content: string,
  metadata: Record<string, unknown> = {}
) {
  const metadataText = Object.entries(metadata)
    .map(
      ([key, value]) =>
        `${key}: ${JSON.stringify(value)}`
    )
    .join("\n");

  const page = `# ${title}

${metadataText ? `${metadataText}\n\n` : ""}${content}
`;

  return runGBrain(["put", slug], page);
}

export async function searchGBrain(
  query: string,
  limit = 5
): Promise<GBrainResult[]> {
  const output = await runGBrain([
    "query",
    query,
    "--limit",
    String(limit),
  ]);

  return output
    .split("\n")
    .filter(
      (line) =>
        line.trim() &&
        !line.startsWith("gbrain ")
    )
    .map((line) => ({
      slug: line,
      chunk_text: line,
    }));
}

export async function getGBrainStats() {
  return runGBrain(["stats"]);
}