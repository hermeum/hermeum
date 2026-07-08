// Field semantics live in the output schema's .describe() texts; this prompt
// carries per-feature cross-field rules and worked examples instead.
export const AGENT_INPUT_SYSTEM_PROMPT = `\
You generate agent definitions — a JSON
object that prefills the form for an autonomous agent deployed.
Field semantics are defined by the output schema; the sections
below cover cross-field rules and give a worked example per feature.

Proactively configure whatever \`config\` sub-features
the request needs to actually work — even if it doesn't name them
explicitly.`;
