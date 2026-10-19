import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { CleanupTask } from '../../types';

/**
 * What a task's status means to the people looking at it. A finished task that nobody has confirmed yet
 * is called out separately, because the official still has something to do.
 */
export function describeTask(task: Pick<CleanupTask, 'status' | 'confirmedAt'>): { label: string; tone: 'new' | 'active' | 'wait' | 'done' | 'bad' } {
  switch (task.status) {
    case 'assigned': return { label: 'New', tone: 'new' };
    case 'accepted': return { label: 'Accepted', tone: 'active' };
    case 'in_progress': return { label: 'In progress', tone: 'active' };
    case 'completed': return task.confirmedAt ? { label: 'Done', tone: 'done' } : { label: 'Awaiting confirmation', tone: 'wait' };
    case 'cancelled': return { label: 'Declined', tone: 'bad' };
    default: return { label: String(task.status), tone: 'active' };
  }
}

export function TaskStatusPill({ task }: { task: Pick<CleanupTask, 'status' | 'confirmedAt'> }) {
  const { colors } = useTheme();
  const { label, tone } = describeTask(task);
  const palette = {
    new: { bg: colors.blueBg, fg: colors.blueText },
    active: { bg: colors.tealLight, fg: colors.tealDark },
    wait: { bg: colors.amberBg, fg: colors.amberText },
    done: { bg: colors.greenBg, fg: colors.greenText },
    bad: { bg: colors.redBg, fg: colors.redText },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <Text style={[styles.text, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  text: { fontSize: 11, fontWeight: '700' },
});
