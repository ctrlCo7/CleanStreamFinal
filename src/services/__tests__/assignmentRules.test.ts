import { describe, expect, it } from 'vitest';
import { assignmentProblem, reportBarangayId } from '../assignmentRules';

const report = (barangayId?: string, locId?: string) =>
  ({ barangayId, barangay: 'Guadalupe', location: { latitude: 0, longitude: 0, timestamp: 0, barangayId: locId } });
const crew = (barangayId?: string) => ({ name: 'Crew A', barangayId, barangay: barangayId === 'guadalupe' ? 'Guadalupe' : 'Tinago' });
const official = (barangayId: string) => ({ role: 'barangay' as const, barangayId });
const admin = { role: 'admin' as const };

describe('assignmentProblem', () => {
  it("lets the report's own officials and the Admin assign the report's own crews", () => {
    expect(assignmentProblem(report('guadalupe'), crew('guadalupe'), official('guadalupe'))).toBeNull();
    expect(assignmentProblem(report('guadalupe'), crew('guadalupe'), admin)).toBeNull();
  });
  it('never hands a cleanup to another barangay’s crew, even for the Admin', () => {
    expect(assignmentProblem(report('guadalupe'), crew('tinago'), admin)).toMatch(/crew of Tinago.*Only Guadalupe's own crews/);
    expect(assignmentProblem(report('guadalupe'), crew('tinago'), official('guadalupe'))).toMatch(/Only Guadalupe's own crews/);
    expect(assignmentProblem(report('guadalupe'), crew(undefined), admin)).toBeTruthy();
  });
  it("doesn't let another barangay's official assign it", () => {
    expect(assignmentProblem(report('guadalupe'), crew('guadalupe'), official('tinago'))).toMatch(/Only Guadalupe's officials or the Admin/);
  });
  it('refuses citizens, crews and reports without a barangay', () => {
    expect(assignmentProblem(report('guadalupe'), crew('guadalupe'), { role: 'citizen' })).toBeTruthy();
    expect(assignmentProblem(report('guadalupe'), crew('guadalupe'), { role: 'cleanup_team', barangayId: 'guadalupe' })).toBeTruthy();
    expect(assignmentProblem(report(undefined), crew('guadalupe'), admin)).toMatch(/no barangay/);
  });
  it("uses the report's location barangay when the top-level one is missing", () => {
    expect(reportBarangayId(report(undefined, 'guadalupe'))).toBe('guadalupe');
    expect(reportBarangayId(report('tinago', 'guadalupe'))).toBe('tinago');
  });
});
