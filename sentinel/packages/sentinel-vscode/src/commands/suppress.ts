import type { LanguageClient } from "vscode-languageclient/node";

export async function handleSuppress(
  client: LanguageClient,
  findingId: string,
): Promise<void> {
  await client.sendRequest("workspace/executeCommand", {
    command: "sentinel.suppress",
    arguments: [findingId],
  });
}
