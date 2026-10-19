import React, { useMemo } from 'react';
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ThemeColors } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { formatPhone, smsUrl, telUrl } from '../../utils/phone';

interface Props {
  /** Who is being contacted, e.g. "Crew leader" or "Barangay official". */
  label: string;
  name: string;
  /** Normalised +63 number, if the person has one on file. */
  phone?: string;
}

async function open(url: string, what: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(`Can't ${what}`, `This phone couldn't open the ${what === 'call' ? 'dialer' : 'messages app'}.`);
  }
}

/** A person's name and number with one-tap Call and Text. Shows a plain note when there is no number. */
export function ContactButtons({ label, name, phone }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.card}>
      <View style={styles.info}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.name} numberOfLines={1}>{name || 'Not set'}</Text>
        <Text style={styles.phone}>{phone ? formatPhone(phone) : 'No number on file'}</Text>
      </View>
      {!!phone && (
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.callBtn]} onPress={() => open(telUrl(phone), 'call')} accessibilityLabel={`Call ${name}`}>
            <Text style={styles.callText}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.textBtn]} onPress={() => open(smsUrl(phone), 'text')} accessibilityLabel={`Text ${name}`}>
            <Text style={styles.textText}>Text</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: Colors.white,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  info: { flex: 1, gap: 2 },
  label: { fontSize: 11, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: '600' },
  name: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  phone: { fontSize: 13, color: Colors.textMuted },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  callBtn: { backgroundColor: Colors.teal },
  callText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  textBtn: { backgroundColor: Colors.grayBg },
  textText: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600' },
});
