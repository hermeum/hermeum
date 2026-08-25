import { HermesSkillIndex } from "../src/server/infras/hermes-skill-index";

const query = process.argv[2] ?? "";
const limit = Number(process.argv[3] ?? 25);

const index = new HermesSkillIndex();

const results = await index.searchSkills(query, limit);

console.log(`query=${JSON.stringify(query)} limit=${limit} count=${results.length}`);
for (const r of results) {
  console.log(`\n- ${r.name}  [${r.identifier}]\n  ${r.description}`);
}