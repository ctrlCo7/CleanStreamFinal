import { describe, expect, it } from 'vitest';
import { notificationTarget } from '../notificationRouting';

describe('the "cleaned up" notification', () => {
  it("opens the citizen's report, where the before and after photos are shown", () => {
    expect(notificationTarget({ type: 'report_completed', reportId: 'r1' }, 'citizen'))
      .toEqual({ screen: 'CitizenDetail', params: { reportId: 'r1' } });
  });

  it('still opens the report when it also names the cleanup task', () => {
    expect(notificationTarget({ type: 'report_completed', reportId: 'r1', taskId: 't1' }, 'citizen'))
      .toEqual({ screen: 'CitizenDetail', params: { reportId: 'r1' } });
  });

  it("takes staff to the task, where they review the crew's photos", () => {
    expect(notificationTarget({ type: 'task_updated', reportId: 'r1', taskId: 't1' }, 'admin'))
      .toEqual({ screen: 'CleanupTaskDetail', params: { taskId: 't1' } });
  });
});
