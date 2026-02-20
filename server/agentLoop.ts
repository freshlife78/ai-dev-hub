import Anthropic from "@anthropic-ai/sdk";
import {
  type RepoContext,
  type FileWrite,
  type AgentStep,
  toolDefinitions,
  executeReadFile,
  executeListDirectory,
  executeSearchCode,
  executeCreatePR,
} from "./agentTools";

const MAX_ITERATIONS = 25;

export interface AgentRunOptions {
  apiKey: string;
  repo: RepoContext;
  systemPrompt: string;
  userMessage: string;
  onStep: (step: AgentStep) => void;
}

export async function runAgentLoop(options: AgentRunOptions): Promise<{
  pendingWrites: FileWrite[];
  prUrl?: string;
  prNumber?: number;
}> {
  const { apiKey, repo, systemPrompt, userMessage, onStep } = options;
  const anthropic = new Anthropic({ apiKey });
  const pendingWrites: FileWrite[] = [];
  let prUrl: string | undefined;
  let prNumber: number | undefined;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let response: Anthropic.Message;
    try {
      response = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 8192,
        system: systemPrompt,
        tools: toolDefinitions,
        messages,
      });
    } catch (err: any) {
      onStep({ type: "error", content: `API error: ${err.message}` });
      break;
    }

    // Extract text blocks and emit thinking
    const textBlocks = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("");
    if (textBlocks) {
      onStep({ type: "thinking", content: textBlocks });
    }

    // If the model stopped without tool use, we're done
    if (response.stop_reason === "end_turn" || response.stop_reason === "max_tokens") {
      onStep({ type: "done", content: textBlocks || "Agent finished." });
      break;
    }

    // Process tool calls
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (toolUseBlocks.length === 0) {
      onStep({ type: "done", content: textBlocks || "Agent finished." });
      break;
    }

    // Add assistant response to conversation
    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolCall of toolUseBlocks) {
      const input = toolCall.input as any;
      onStep({ type: "tool_call", tool: toolCall.name, input });

      let resultText: string;

      try {
        switch (toolCall.name) {
          case "read_file": {
            resultText = await executeReadFile(repo, input.path);
            onStep({ type: "tool_result", tool: "read_file", result: `Read ${input.path} (${resultText.length} chars)` });
            break;
          }

          case "list_directory": {
            resultText = await executeListDirectory(repo, input.path || "");
            onStep({ type: "tool_result", tool: "list_directory", result: `Listed ${input.path || "root"}` });
            break;
          }

          case "search_code": {
            resultText = await executeSearchCode(repo, input.query, input.file_extension);
            onStep({ type: "tool_result", tool: "search_code", result: resultText.slice(0, 200) });
            break;
          }

          case "write_file": {
            pendingWrites.push({
              path: input.path,
              content: input.content,
              description: input.description,
            });
            resultText = `File "${input.path}" staged for commit. (${pendingWrites.length} file(s) staged total)`;

            // Read original content for diff display
            let originalContent = "";
            try {
              const orig = await executeReadFile(repo, input.path);
              if (!orig.startsWith("Error:")) originalContent = orig;
            } catch {}

            onStep({
              type: "file_write",
              path: input.path,
              fileContent: input.content,
              description: input.description,
              content: originalContent,
            });
            break;
          }

          case "create_pull_request": {
            if (pendingWrites.length === 0) {
              resultText = "Error: No files have been written yet. Use write_file first.";
              onStep({ type: "error", content: resultText });
            } else {
              try {
                const pr = await executeCreatePR(
                  repo,
                  pendingWrites,
                  input.title,
                  input.body,
                  input.branch_name,
                );
                prUrl = pr.url;
                prNumber = pr.number;
                resultText = `Pull Request #${pr.number} created successfully: ${pr.url}`;
                onStep({
                  type: "pr_created",
                  prUrl: pr.url,
                  prNumber: pr.number,
                  branchName: input.branch_name,
                  content: resultText,
                });
              } catch (err: any) {
                resultText = `Error creating PR: ${err.message}`;
                onStep({ type: "error", content: resultText });
              }
            }
            break;
          }

          default:
            resultText = `Unknown tool: ${toolCall.name}`;
        }
      } catch (err: any) {
        resultText = `Tool error: ${err.message}`;
        onStep({ type: "error", content: resultText });
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolCall.id,
        content: resultText,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return { pendingWrites, prUrl, prNumber };
}
