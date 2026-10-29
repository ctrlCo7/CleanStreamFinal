import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useAppSelector } from '../store/hooks';
import { barangayInboxKey, getOrCreateBarangayConversation } from '../services/messagingService';

/**
 * Opens a citizen's chat with a barangay's shared inbox (any barangay in Cebu City, e.g.
 * where they reported a waterway). `reportTag` labels the chat with the report number.
 */
export function useMessageBarangay() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useAppSelector((s) => s.auth.user);
  const [opening, setOpening] = useState(false);

  const open = useCallback(async (barangay: { id: string; name: string }, reportTag?: string) => {
    if (!user?.uid || opening) return;
    setOpening(true);
    try {
      const conversationId = await getOrCreateBarangayConversation(
        { uid: user.uid, name: `${user.firstName} ${user.lastName}`.trim() || 'Resident', role: user.role },
        barangay,
        reportTag,
      );
      navigation.navigate('CitizenChat', {
        conversationId,
        participantName: `Brgy. ${barangay.name}`,
        receiverId: barangayInboxKey(barangay.id),
      });
    } catch {
      Alert.alert('Couldn’t open chat', 'Please check your connection and try again.');
    } finally {
      setOpening(false);
    }
  }, [user, opening, navigation]);

  return { open, opening };
}
