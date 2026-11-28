// Synthetic acceptance benchmark; run directly, or against a built server via
// CAREER_ANALYSIS_URL=http://127.0.0.1:PORT node --import tsx tests/career-analysis-performance.ts
import assert from "node:assert/strict";
import { annualTaxCareerInputs } from "./fixtures/fire-milestones";
import { calculateEmploymentIncome } from "../src/domain/projection/employment-income";
import { calculateFireMilestones } from "../src/domain/projection/fire-milestones";
import { careerPreset } from "../src/domain/scenario/career";

async function main() {
  const inputs = annualTaxCareerInputs();
  const career = careerPreset(inputs, "reduced_income").careerTransition!;
  career.phases.forEach(p => { p.employment = { mode: "gross_estimate", annualGrossToday: 0 }; });
  const employmentIncome = { retirementAge: 65, stepMonths: 12, maxAnnualGrossToday: 200000, resolutionAnnualGrossToday: 100, career };
  const fireMilestones = { retirementAge: 65, stepMonths: 12, fullCppBenefitMultiplier: 1,
    coast: careerPreset(inputs, "coast").careerTransition!, barista: careerPreset(inputs, "barista").careerTransition! };
  const url = process.env.CAREER_ANALYSIS_URL;
  const request = async (payload: object) => {
    const response = await fetch(`${url}/api/v1/projections`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    assert.equal(response.status, 200);
    return response.json();
  };
  for (const negative of [false, true]) {
    const plan = structuredClone(inputs);
    if (negative) plan.retirementRequirement.minimumEndingFinancialAssetsToday = 100000000;
    const started = performance.now();
    const result: ReturnType<typeof calculateEmploymentIncome> = url ? await request({ inputs: plan, employmentIncome }) : calculateEmploymentIncome(plan, employmentIncome);
    const completed = result.points.filter(p => p.required.status !== "unavailable" && p.livingCosts.status !== "unavailable").length;
    console.log(JSON.stringify({ analysis: "income", negative, elapsedMs: Math.round(performance.now() - started), completed, points: result.points.length,
      simulations: result.work?.simulations, simulatedMonths: result.work?.simulatedMonths,
      bytes: Buffer.byteLength(JSON.stringify(result)), available: result.points.filter(p => p.required.status === "available").length,
      reasons: [...new Set(result.points.filter(p => p.required.status === "unavailable").map(p => p.required.reason))] }));
    // BASELINE_PROFILE records existing failures without certifying them.
    if (!process.env.BASELINE_PROFILE) {
      assert.equal(result.points.length, 26);
      assert.equal(completed, 26, "The ordinary annual grid must complete without raising the existing budget");
      assert(result.points.every(p => p.required.status === (negative ? "not_found" : "available")));
    }
    const fireStart = performance.now();
    const fire: ReturnType<typeof calculateFireMilestones> = url ? await request({ inputs: plan, fireMilestones }) : calculateFireMilestones(plan, fireMilestones);
    console.log(JSON.stringify({ analysis: "fire", negative, elapsedMs: Math.round(performance.now() - fireStart),
      completed: fire.results.filter(r => r.status !== "unavailable").length, candidates: fire.results.reduce((n, r) => n + r.tested.length, 0),
      bytes: Buffer.byteLength(JSON.stringify(fire)), statuses: fire.results.map(r => r.status) }));
    if (!process.env.BASELINE_PROFILE) assert(fire.results.every(r => r.status !== "unavailable"));
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
