import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { useAppSelector } from '../../store/hooks';
import { subscribeToNotifications } from '../../services/notificationService';
import { RootStackParamList } from '../../types';
import { BellIcon } from './TabIcons';

/**
 * Opens the person's notifications, with the number of unread ones. Officials, Captains and
 * crews had no way to see their notifications (schedule decisions, missed checkpoints...).
 */
export function NotificationBell() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const uid = useAppSelector((s) => s.auth.user?.uid);
  const [unread, setUnread] = useState(0);
  useEffect(() => (uid ? subscribeToNotifications(uid, (list) => setUnread(list.filter((n) => !n.read).length)) : undefined), [uid]);
  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: colors.grayBg }]}
      onPress={() => navigation.navigate('CitizenNotifications')}
      accessibilityRole="button"
      accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
    >
      <BellIcon color={colors.textSecondary} size={18} />
      {unread > 0 && (
        <View style={[styles.badge, { backgroundColor: colors.red }]}>
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
