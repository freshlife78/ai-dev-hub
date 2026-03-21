import Anthropic from "@anthropic-ai/sdk";

export interface TriageResult {
  lane: "ops_alert" | "software_bug" | "improvement" | "knowledge_update";
  urgency: "critical" | "normal";
  assigned_agent: "claude_code" | "cursor_opus" | null;
  triage_notes: string;
  confidence: number;
}

interface TriageInput {
  reporter_type: string;
  reporter_name?: string;
  description: string;
  page_url?: string;
}

const SYSTEM_PROMPT = `You are the triage agent for Cool Dispatch, a refrigerated logistics SaaS.
Classify the ticket and return ONLY valid JSON, no other text, no markdown.`;

export async function triageTicket(input: TriageInput): Promise<TriageResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const anthropic = new Anthropic({ apiKey });

  const userPrompt = `Reporter: ${input.reporter_type} — ${input.reporter_name || "unknown"}
Page: ${input.page_url || "N/A"}
Description: ${input.description}

Return this exact JSON structure:
{
  "lane": "ops_alert" | "software_bug" | "improvement" | "knowledge_update",
  "urgency": "critical" | "normal",
  "assigned_agent": "claude_code" | "cursor_opus" | null,
  "triage_notes": "one sentence rationale",
  "confidence": 0-100
}

Rules:
- ops_alert: delivery complaints, missing items, driver issues
- software_bug: broken UI, crashes, upload failures, wrong behaviour
- improvement: feature requests, workflow ideas
- knowledge_update: new lessons or constraints to document
- If reporter_type is 'customer' and lane is ambiguous → ops_alert
- If confidence < 80 → ops_alert
- assigned_agent is null for ops_alert and improvement
- For software_bug: claude_code if single file likely, cursor_opus if complex`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const result: TriageResult = JSON.parse(text);
  return result;
}
