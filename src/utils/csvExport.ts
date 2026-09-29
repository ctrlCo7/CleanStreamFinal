import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';

const escapeCsvCell = (value: string | number): string => {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

export const rowsToCsv = (headers: string[], rows: (string | number)[][]): string => {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(','));
  return lines.join('\n');
};

export const exportCsv = async (fileName: string, csv: string): Promise<void> => {
  if (Platform.OS === 'web') {
    Alert.alert('Export unavailable', 'File export isn’t supported on web — open the app on iOS or Android to export.');
    return;
  }
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    Alert.alert('Export unavailable', 'Sharing isn’t available on this device.');
    return;
  }
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.write(csv);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: fileName });
};
