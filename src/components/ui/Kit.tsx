/**
 * Shared building blocks for the staff screens (Barangay and Admin), so they share one
 * look with the resident screens: a header with greeting, cards, a stat strip, section
 * headings, action tiles and list rows. Every piece follows the light/dark theme.
 */
import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';

export const greetingFor = (d = new Date()) =>
  d.getHours() < 12 ? 'Good morning' : d.getHours() < 18 ? 'Good afternoon' : 'Good evening';

function useKit() {
  const { colors } = useTheme();
  return { colors, s: useMemo(() => createStyles(colors), [colors]) };
}

/** Top bar: big title, a subtitle, and optional things on the right (role pill, buttons). */
export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  const { s } = useKit();
  return (
    <View style={s.header}>
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={s.headerSub} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

export function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  const { s } = useKit();
  return <View style={[s.pill, { backgroundColor: bg }]}><Text style={[s.pillText, { color }]}>{label}</Text></View>;
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const { s } = useKit();
  if (onPress) {
    return <TouchableOpacity style={[s.card, style]} onPress={onPress} activeOpacity={0.85}>{children}</TouchableOpacity>;
  }
  return <View style={[s.card, style]}>{children}</View>;
}

export function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { s } = useKit();
  return (
    <View style={s.sectionHead}>
      <Text style={s.sectionTitle}>{title}</Text>
      {!!action && onAction && <TouchableOpacity onPress={onAction}><Text style={s.link}>{action}</Text></TouchableOpacity>}
    </View>
  );
}

/** Numbers side by side in one card, divided by thin lines. */
export function StatStrip({ items }: { items: Array<{ value: number | string; label: string; color?: string; onPress?: () => void }> }) {
  const { s, colors } = useKit();
  return (
    <View style={[s.card, s.statStrip]}>
      {items.map((it, i) => (
        <React.Fragment key={it.label}>
          {i > 0 && <View style={s.statDivider} />}
          <TouchableOpacity style={s.stat} onPress={it.onPress} disabled={!it.onPress} activeOpacity={0.7}>
            <Text style={[s.statValue, { color: it.color ?? colors.textPrimary }]}>{it.value}</Text>
            <Text style={s.statLabel}>{it.label}</Text>
          </TouchableOpacity>
        </React.Fragment>
      ))}
    </View>
  );
}

export interface ActionTileProps { icon: string; label: string; sub?: string; tint: string; tintBg: string; onPress: () => void; badge?: number; disabled?: boolean }

/** Big tappable tiles, two per row. */
export function ActionGrid({ tiles }: { tiles: ActionTileProps[] }) {
  const { s, colors } = useKit();
  return (
    <View style={s.grid}>
      {tiles.map((t) => (
        <TouchableOpacity key={t.label} style={[s.card, s.tile]} onPress={t.onPress} disabled={t.disabled} activeOpacity={0.85} accessibilityRole="button">
          <View style={[s.tileIcon, { backgroundColor: t.tintBg }]}><Text style={s.tileEmoji}>{t.icon}</Text></View>
          <Text style={s.tileLabel} numberOfLines={2}>{t.label}</Text>
          {!!t.sub && <Text style={s.tileSub} numberOfLines={2}>{t.sub}</Text>}
          {!!t.badge && t.badge > 0 && (
            <View style={[s.badge, { backgroundColor: colors.red }]}><Text style={s.badgeText}>{t.badge > 99 ? '99+' : t.badge}</Text></View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** A row inside a list card: colour bar or dot, title, meta, and something on the right. */
export function ListRow({ title, meta, accent, right, onPress, first }: {
  title: string; meta?: string; accent?: string; right?: React.ReactNode; onPress?: () => void; first?: boolean;
}) {
  const { s } = useKit();
  const body = (
    <>
      {!!accent && <View style={[s.accent, { backgroundColor: accent }]} />}
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{title}</Text>
        {!!meta && <Text style={s.rowMeta} numberOfLines={2}>{meta}</Text>}
      </View>
      {right}
    </>
  );
  const style = [s.row, !first && s.rowDivider];
  return onPress
    ? <TouchableOpacity style={style} onPress={onPress} activeOpacity={0.8}>{body}</TouchableOpacity>
    : <View style={style}>{body}</View>;
}

/** A coloured call-to-action strip for things that need attention now. */
export function AlertStrip({ title, sub, color, bg, onPress, icon }: {
  title: string; sub?: string; color: string; bg: string; onPress?: () => void; icon?: string;
}) {
  const { s } = useKit();
  return (
    <TouchableOpacity style={[s.alert, { backgroundColor: bg, borderColor: color }]} onPress={onPress} disabled={!onPress} activeOpacity={0.85}>
      {!!icon && <Text style={s.alertIcon}>{icon}</Text>}
      <View style={{ flex: 1 }}>
        <Text style={[s.alertTitle, { color }]}>{title}</Text>
        {!!sub && <Text style={[s.alertSub, { color }]}>{sub}</Text>}
      </View>
      {onPress && <Text style={[s.chev, { color }]}>›</Text>}
    </TouchableOpacity>
  );
}

export function EmptyNote({ title, text }: { title: string; text?: string }) {
  const { s } = useKit();
  return (
    <View style={[s.card, { alignItems: 'center', gap: 4, paddingVertical: 20 }]}>
      <Text style={s.rowTitle}>{title}</Text>
      {!!text && <Text style={[s.rowMeta, { textAlign: 'center' }]}>{text}</Text>}
    </View>
  );
}

const shadow = (Colors: ThemeColors) => ({
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: Colors.border,
  shadowColor: Colors.shadow,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.05,
  shadowRadius: 12,
  elevation: 1,
});

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  header: {
    backgroundColor: Colors.surface, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  headerSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  pillText: { fontSize: 11, fontWeight: '700' },
  card: { backgroundColor: Colors.surface, borderRadius: 18, padding: 14, ...shadow(Colors) },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  link: { fontSize: 13, fontWeight: '600', color: Colors.teal },
  statStrip: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 4 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: Colors.borderMid, marginVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48.4%', gap: 6, minHeight: 112 },
  tileIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tileEmoji: { fontSize: 18 },
  tileLabel: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  tileSub: { fontSize: 11, color: Colors.textMuted, lineHeight: 15 },
  badge: { position: 'absolute', top: 10, right: 10, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  accent: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  rowMeta: { fontSize: 12, color: Colors.textMuted, lineHeight: 16 },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 13, borderWidth: 1 },
  alertIcon: { fontSize: 20 },
  alertTitle: { fontSize: 14, fontWeight: '700' },
  alertSub: { fontSize: 12, marginTop: 2, opacity: 0.9 },
  chev: { fontSize: 22, marginTop: -2 },
});
