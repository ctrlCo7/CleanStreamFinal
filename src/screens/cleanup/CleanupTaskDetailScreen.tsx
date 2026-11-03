import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, TextInput, ActivityIndicator, Alert,
  Linking, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { AIAnalysisResult, CleanupTask, CrewTracking, RootStackParamList } from '../../types';
import { useAppSelector } from '../../store/hooks';
import { BackIcon } from '../../components/common/TabIcons';
import { Badge } from '../../components/common/Badge';
import { TaskStatusPill } from '../../components/common/TaskStatusPill';
import { ContactButtons } from '../../components/common/ContactButtons';
import { formatDateKey, formatDayAndTime, formatHHmm } from '../../utils/dates';
import {
  subscribeToTask, respondToTask, startTask, addPhotoToTask, finishTask, confirmTaskCompleted, recordWorkOnBehalf,
} from '../../services/crewService';
import { captureTaskPhoto } from '../../services/taskPhotoCapture';
import { getReportById } from '../../services/reportsService';
import { VERDICT_TEXT, compareCleanup } from '../../services/cleanupComparison';
import { formatVolume } from '../../utils/units';
import { endTrip, isTripActive, startTrip, subscribeTracking, watchLocalTrip } from '../../services/crewTrackingService';
import { lacksPlayServices } from '../../services/devicePosition';
import { CrewTrackingCard } from '../../components/map/CrewTrackingCard';

type Props = NativeStackScreenProps<RootStackParamList, 'CleanupTaskDetail'>;
type Phase = 'before' | 'after';

const messageOf = (err: unknown): string =>
  err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.';

export default function CleanupTaskDetailScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { taskId } = route.params;
  const user = useAppSelector((s) => s.auth.user);

  const [task, setTask] = useState<CleanupTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<Phase | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [kg, setKg] = useState('');
  const [notes, setNotes] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);
  const [reportAi, setReportAi] = useState<AIAnalysisResult | undefined>();
  const [tracking, setTracking] = useState<CrewTracking | null>(null);
  useEffect(() => subscribeTracking(taskId, setTracking), [taskId]);
  // This phone's own trip, straight from its GPS (no server round trip), for the driver's map.
  const [localTrip, setLocalTrip] = useState<CrewTracking | null>(null);
  useEffect(() => watchLocalTrip(taskId, setLocalTrip), [taskId]);

  // The original report's analysis is the "before" when no before photo was analyzed.
  const reportId = task?.reportId;
  useEffect(() => {
    if (!reportId) return;
    getReportById(reportId).then((r) => setReportAi(r?.aiAnalysis)).catch(() => undefined);
  }, [reportId]);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToTask(taskId, (t) => {
      setTask(t);
      setLoading(false);
    }, () => {
      setTask(null);
      setLoading(false);
    });
    return unsub;
  }, [taskId]);

  const isLeader = !!user && !!task && task.assignedTeamId === user.uid;
  const isOfficial = !!user && !!task && !isLeader
    && (user.role === 'admin' || (user.role === 'barangay' && !!user.barangayId && user.barangayId === task.barangayId));

  const Header = (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
        <BackIcon size={18} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Cleanup task</Text>
      <View style={{ width: 38 }} />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        {Header}
        <View style={styles.center}><ActivityIndicator color={colors.green} /></View>
      </SafeAreaView>
    );
  }

  if (!task) {
    return (
      <SafeAreaView style={styles.container}>
        {Header}
        <View style={styles.center}>
          <Text style={styles.messageText}>This task could not be found. It may have been removed.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user || (!isLeader && !isOfficial)) {
    return (
      <SafeAreaView style={styles.container}>
        {Header}
        <View style={styles.center}>
          <Text style={styles.messageText}>You don&apos;t have access to this task.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Parses the optional kg box. Returns null when the text is not a usable number (an alert is shown).
  const parseKg = (): { ok: true; value?: number } | { ok: false } => {
    const text = kg.trim().replace(',', '.');
    if (!text) return { ok: true };
    const n = Number(text);
    if (!Number.isFinite(n) || n < 0) {
      Alert.alert('Check the weight', 'Enter the waste collected as a number, like 25 or 12.5. Or leave it empty.');
      return { ok: false };
    }
    return { ok: true, value: n };
  };

  // Runs one action with every button disabled meanwhile and a plain message if it fails.
  const run = async (action: () => Promise<void>, success?: { title: string; body: string }) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      if (success) Alert.alert(success.title, success.body);
    } catch (err) {
      Alert.alert('That did not work', messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const addPhoto = async (phase: Phase) => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureTaskPhoto();
      if (!uri) return;
      setUploading(phase);
      await addPhotoToTask(task, phase, uri);
    } catch (err) {
      Alert.alert('Photo not saved', messageOf(err));
    } finally {
      setUploading(null);
      setBusy(false);
    }
  };

  const openMaps = () => {
    const { latitude, longitude } = task.location;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`).catch(() =>
      Alert.alert("Can't open Maps", 'This phone could not open the map. Try again later.'));
  };

  const accept = () => run(() => respondToTask(task, user, true));

  const submitDecline = async () => {
    if (!declineReason.trim()) {
      Alert.alert('Reason needed', 'Please tell the official why you cannot do this task.');
      return;
    }
    await run(async () => {
      await respondToTask(task, user, false, declineReason.trim());
      setDeclineOpen(false);
      setDeclineReason('');
    });
  };

  // Arriving or starting work ends the trip, so the crew's location stops being shared.
  const start = () => run(async () => {
    if (tracking?.status === 'en_route') await endTrip(task.id, 'arrived');
    await startTask(task, user);
  });

  const tripLive = tracking?.status === 'en_route' && isTripActive(task.id);
  const beginTrip = () => run(async () => {
    const mode = await startTrip(task, user, {
      onArrived: () => Alert.alert('You have arrived', 'Take a before photo, then tap Start work.'),
      onError: (message) => Alert.alert('Location not shared', message),
    });
    if (mode === 'foreground') {
      Alert.alert(
        'Keep CleanStream open',
        lacksPlayServices()
          ? 'Location is only shared while the app is open, because this phone does not have Google Play services.'
          : 'Location is only shared while the app is open, because "Allow all the time" was not chosen. You can change this in Settings → Apps → CleanStream → Location.',
      );
    }
  });
  // Android shows its own "Allow all the time" screen; say why first, so the crew picks it.
  const goOnMyWay = () => Alert.alert(
    'Share your location on the way',
    'The official and the person who reported this will see your truck on the map until you arrive.\n\n'
      + 'On the next screen, choose "Allow all the time" so it keeps working when you switch apps or lock the phone. Sharing stops by itself when you arrive.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Continue', onPress: beginTrip }],
  );
  const stopSharing = () => Alert.alert('Stop sharing your location?', 'The official and the reporter will no longer see your truck on the map.', [
    { text: 'Keep sharing', style: 'cancel' },
    { text: 'Stop', style: 'destructive', onPress: () => { endTrip(task.id, 'ended'); } },
  ]);

  const finish = () => {
    const parsed = parseKg();
    if (!parsed.ok) return;
    Alert.alert('Finish this task?', 'The official will be told and will check your photos.', [
      { text: 'Not yet', style: 'cancel' },
      {
        text: 'Finish task',
        onPress: () => run(
          () => finishTask(task, user, { notes, wasteCollectedKg: parsed.value }),
          { title: 'Task finished', body: 'Thank you! The official will review your photos and confirm.' },
        ),
      },
    ]);
  };

  const recordDone = () => {
    const parsed = parseKg();
    if (!parsed.ok) return;
    Alert.alert(
      'Record as done?',
      'The work will be recorded under your name, and the report will be closed. Make sure the after photos show the cleaned area.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Record as done',
          onPress: () => run(
            () => recordWorkOnBehalf(task, user, { notes, wasteCollectedKg: parsed.value }),
            { title: 'Recorded', body: 'The work is recorded and the report is closed. The reporter has been told.' },
          ),
        },
      ],
    );
  };

  const confirmDone = () => {
    Alert.alert('Confirm cleanup is done?', 'This closes the report and tells the person who reported it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: () => run(
          () => confirmTaskCompleted(task, user),
          { title: 'Cleanup confirmed', body: 'The report is closed and the reporter has been told.' },
        ),
      },
    ]);
  };

  const isOpen = task.status === 'assigned' || task.status === 'accepted' || task.status === 'in_progress';
  const hasAfter = task.afterPhotoURLs.length > 0;
  const showPhotoInputs = (isLeader && task.status === 'in_progress') || (isOfficial && isOpen);

  const Btn = ({ label, onPress, kind = 'primary', disabled }: {
    label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger'; disabled?: boolean;
  }) => {
    const off = busy || !!disabled;
    return (
      <TouchableOpacity
        style={[styles.btn, kind === 'primary' && styles.btnPrimary, kind === 'secondary' && styles.btnSecondary,
          kind === 'danger' && styles.btnDanger, off && styles.btnOff]}
        onPress={onPress}
        disabled={off}
        activeOpacity={0.8}
        accessibilityRole="button"
      >
        <Text style={[styles.btnText, kind === 'primary' && { color: '#fff' }, kind === 'secondary' && { color: colors.textPrimary },
          kind === 'danger' && { color: colors.redText }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const Photos = ({ title, urls, phase }: { title: string; urls: string[]; phase: Phase }) => {
    if (urls.length === 0 && uploading !== phase) {
      return (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.muted}>No photos yet.</Text>
        </View>
      );
    }
    return (
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {urls.map((u) => (
            <TouchableOpacity key={u} onPress={() => setViewing(u)} accessibilityLabel={`${title}, tap to enlarge`}>
              <Image source={{ uri: u }} style={styles.thumb} />
            </TouchableOpacity>
          ))}
          {uploading === phase && (
            <View style={[styles.thumb, styles.thumbLoading]}>
              <ActivityIndicator color={colors.green} />
              <Text style={styles.thumbLoadingText}>Uploading...</Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  };

  const InputsCard = (title: string, hint?: string) => (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {!!hint && <Text style={styles.muted}>{hint}</Text>}
      <Text style={styles.fieldLabel}>Waste collected (kg), optional</Text>
      <TextInput
        style={styles.input}
        value={kg}
        onChangeText={setKg}
        keyboardType="decimal-pad"
        placeholder="For example 25"
        placeholderTextColor={colors.textHint}
        editable={!busy}
      />
      <Text style={styles.fieldLabel}>Notes, optional</Text>
      <TextInput
        style={[styles.input, styles.inputMulti]}
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder="Anything the official should know"
        placeholderTextColor={colors.textHint}
        editable={!busy}
      />
    </View>
  );

  const notesText = task.completionNotes?.trim() || task.progressNotes?.trim();

  return (
    <SafeAreaView style={styles.container}>
      {Header}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{task.title}</Text>
              <Badge variant={task.priority} />
            </View>
            <TaskStatusPill task={task} />
            {!!task.description && <Text style={styles.body2}>{task.description}</Text>}
          </View>

          {task.status === 'cancelled' && (
            <View style={[styles.card, { backgroundColor: colors.redBg }]}>
              <Text style={[styles.sectionTitle, { color: colors.redText }]}>This task was declined</Text>
              <Text style={[styles.body2, { color: colors.redText }]}>{task.declineReason || 'No reason given.'}</Text>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Location</Text>
            <Text style={styles.body2}>{task.location.address || 'No street address'}</Text>
            <Text style={styles.muted}>{task.location.barangay || task.barangay}</Text>
            <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={openMaps} accessibilityRole="button">
              <Text style={[styles.btnText, { color: colors.textPrimary }]}>Open in Maps</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Schedule</Text>
            {[
              { k: 'Date', v: formatDateKey(task.scheduledDate) },
              { k: 'Time', v: `${formatHHmm(task.startTime)} - ${formatHHmm(task.endTime)}` },
              { k: 'People needed', v: String(task.personnelCount) },
              { k: 'Equipment', v: task.equipmentNeeded.length > 0 ? task.equipmentNeeded.join(', ') : 'None listed' },
            ].map((row) => (
              <View key={row.k} style={styles.infoRow}>
                <Text style={styles.infoKey}>{row.k}</Text>
                <Text style={styles.infoVal}>{row.v}</Text>
              </View>
            ))}
          </View>

          {isLeader ? (
            <ContactButtons label="Assigned by" name={task.assignedByName} phone={task.assignedByPhone} />
          ) : (
            <ContactButtons label="Crew leader" name={task.assignedTeamName} phone={task.assignedTeamPhone} />
          )}

          {/* Crew leader actions */}
          {isLeader && task.status === 'assigned' && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Can your crew do this task?</Text>
              <Btn label="Accept task" onPress={accept} />
              <Btn label="Can't do it" kind="danger" onPress={() => setDeclineOpen(true)} />
            </View>
          )}

          {isLeader && task.status === 'accepted' && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{tripLive ? 'Heading to the site' : 'Ready to go?'}</Text>
              {!tripLive && (
                <>
                  <Text style={styles.muted}>
                    Tap “On my way” when you leave. The official and the person who reported it can follow your truck on the map until you arrive.
                  </Text>
                  <Btn label={tracking?.status === 'en_route' ? '🚚 Resume sharing my location' : '🚚 On my way'} onPress={goOnMyWay} />
                </>
              )}
              {tripLive && (
                <>
                  <Text style={styles.muted}>Your location is live. It stops sharing by itself when you arrive.</Text>
                  <Btn label="Stop sharing location" kind="secondary" onPress={stopSharing} />
                </>
              )}
              <Btn label="Add before photo" kind="secondary" onPress={() => addPhoto('before')} />
              <Btn label="Start work" onPress={start} />
            </View>
          )}

          {task.status === 'accepted' && (
            isLeader && tripLive && localTrip?.status === 'en_route'
              ? <CrewTrackingCard tracking={localTrip} driver />
              : <CrewTrackingCard tracking={tracking} />
          )}

          {(task.beforePhotoURLs.length > 0 || uploading === 'before' || isOpen) && (
            <Photos title="Before photos" urls={task.beforePhotoURLs} phase="before" />
          )}
          {(hasAfter || uploading === 'after' || task.status === 'in_progress' || task.status === 'completed') && (
            <Photos title="After photos" urls={task.afterPhotoURLs} phase="after" />
          )}

          {hasAfter && (() => {
            const cmp = compareCleanup(task.beforeAnalysis, task.afterAnalysis, reportAi);
            const tone = cmp.verdict === 'clean' || cmp.verdict === 'mostly' ? colors.tealDark
              : cmp.verdict === 'partial' ? colors.amberText : cmp.verdict === 'little' ? colors.redText : colors.textMuted;
            return (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Cleanup result (AI)</Text>
                {!task.afterAnalysis ? (
                  <Text style={styles.cmpNote}>The AI result appears here shortly after the after photo is added. If it never does, the AI couldn't run on the phone that took the photo.</Text>
                ) : (
                  <>
                    <View style={styles.cmpRow}>
                      <View style={styles.cmpCol}>
                        <Text style={styles.cmpLabel}>Before{cmp.before?.source === 'report' ? ' (report)' : ''}</Text>
                        <Text style={styles.cmpValue}>{cmp.before ? `${cmp.before.objectCount} items` : '—'}</Text>
                        <Text style={styles.cmpSub}>{cmp.before ? formatVolume(cmp.before.volumeM3) : ''}</Text>
                      </View>
                      <Text style={styles.cmpArrow}>→</Text>
                      <View style={styles.cmpCol}>
                        <Text style={styles.cmpLabel}>After</Text>
                        <Text style={styles.cmpValue}>{cmp.after ? `${cmp.after.objectCount} items` : '—'}</Text>
                        <Text style={styles.cmpSub}>{cmp.after ? formatVolume(cmp.after.volumeM3) : ''}</Text>
                      </View>
                      {cmp.removedPct !== undefined && (
                        <View style={[styles.cmpCol, { alignItems: 'flex-end' }]}>
                          <Text style={styles.cmpLabel}>Removed</Text>
                          <Text style={[styles.cmpValue, { color: tone }]}>{cmp.removedPct}%</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.cmpVerdict, { color: tone }]}>{VERDICT_TEXT[cmp.verdict]}</Text>
                    <Text style={styles.cmpNote}>Counts what the AI can see in the photos. Check the photos yourself before confirming.</Text>
                  </>
                )}
              </View>
            );
          })()}

          {isLeader && task.status === 'in_progress' && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Photos</Text>
              <Btn label="Add before photo" kind="secondary" onPress={() => addPhoto('before')} />
              <Btn label="Add after photo" kind="secondary" onPress={() => addPhoto('after')} />
            </View>
          )}

          {isLeader && task.status === 'in_progress' && (
            <>
              {InputsCard('When you are done')}
              <View style={styles.card}>
                {!hasAfter && <Text style={styles.hint}>Add at least one after photo first.</Text>}
                <Btn label="Finish task" onPress={finish} disabled={!hasAfter} />
              </View>
            </>
          )}

          {isLeader && task.status === 'completed' && !task.confirmedAt && (
            <View style={[styles.card, { backgroundColor: colors.amberBg }]}>
              <Text style={[styles.body2, { color: colors.amberText, fontWeight: '600' }]}>Waiting for the official to confirm.</Text>
            </View>
          )}

          {/* Official / admin actions */}
          {isOfficial && isOpen && (
            <>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Crew has no phone or app?</Text>
                <Text style={styles.muted}>
                  You can record the work for them. Take after photos of the cleaned area, then tap Record as done.
                  It will be saved under your name.
                </Text>
                <Btn label="Add after photo" kind="secondary" onPress={() => addPhoto('after')} />
              </View>
              {InputsCard('Details for the record')}
              <View style={styles.card}>
                {!hasAfter && <Text style={styles.hint}>Add at least one after photo first.</Text>}
                <Btn label="Record as done" onPress={recordDone} disabled={!hasAfter} />
              </View>
            </>
          )}

          {isOfficial && task.status === 'completed' && !task.confirmedAt && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>The crew says it is done</Text>
              <Text style={styles.muted}>Check the after photos above. If the area is clean, confirm it.</Text>
              <Btn label="Confirm cleanup is done" onPress={confirmDone} />
            </View>
          )}

          {isOfficial && task.status === 'cancelled' && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>This crew can&apos;t do it</Text>
              <Btn label="Assign another crew" onPress={() => navigation.navigate('BarangayAssignCrew', { reportId: task.reportId })} />
            </View>
          )}

          {/* Results */}
          {(task.wasteCollectedKg !== undefined || !!notesText || task.status === 'completed') && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Results</Text>
              {task.wasteCollectedKg !== undefined && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Waste collected</Text>
                  <Text style={styles.infoVal}>{task.wasteCollectedKg} kg</Text>
                </View>
              )}
              {task.completedAt ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Finished</Text>
                  <Text style={styles.infoVal}>{formatDayAndTime(task.completedAt)}</Text>
                </View>
              ) : null}
              {!!task.recordedByName && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Recorded by</Text>
                  <Text style={styles.infoVal}>{task.recordedByName}</Text>
                </View>
              )}
              {!!notesText && <Text style={[styles.body2, { marginTop: 6 }]}>{notesText}</Text>}
              {task.status === 'completed' && !!task.confirmedAt && (
                <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.infoKey}>Confirmed</Text>
                  <Text style={[styles.infoVal, { color: colors.greenText }]}>
                    {formatDayAndTime(task.confirmedAt)}
                    {task.recordedByUserId && task.recordedByUserId === task.confirmedByUserId
                      ? ` by ${task.recordedByName ?? 'an official'}`
                      : ''}
                  </Text>
                </View>
              )}
            </View>
          )}

          {busy && !uploading && <ActivityIndicator color={colors.green} />}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Decline reason */}
      <Modal visible={declineOpen} transparent animationType="fade" onRequestClose={() => !busy && setDeclineOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Why can&apos;t you do this task?</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={declineReason}
              onChangeText={setDeclineReason}
              multiline
              placeholder="For example: our crew is busy that day"
              placeholderTextColor={colors.textHint}
              editable={!busy}
              autoFocus
            />
            <Btn label="Send answer" kind="danger" onPress={submitDecline} />
            <Btn label="Cancel" kind="secondary" onPress={() => setDeclineOpen(false)} />
          </View>
        </View>
      </Modal>

      {/* Full-size photo */}
      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <TouchableOpacity style={styles.viewer} activeOpacity={1} onPress={() => setViewing(null)}>
          {!!viewing && <Image source={{ uri: viewing }} style={styles.viewerImage} resizeMode="contain" />}
          <Text style={styles.viewerHint}>Tap anywhere to close</Text>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  cmpRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.grayBg, borderRadius: 12, padding: 12 },
  cmpCol: { flex: 1, gap: 2 },
  cmpArrow: { fontSize: 18, color: Colors.textHint },
  cmpLabel: { fontSize: 11, color: Colors.textMuted },
  cmpValue: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  cmpSub: { fontSize: 11, color: Colors.textMuted },
  cmpVerdict: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  cmpNote: { fontSize: 11, color: Colors.textMuted, lineHeight: 16 },
  header: { backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  messageText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  body: { padding: 16, gap: 14, paddingBottom: 32 },
  card: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 14, gap: 10,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontSize: 17, fontWeight: '600', color: Colors.textPrimary },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  body2: { fontSize: 14, color: Colors.textPrimary, lineHeight: 20 },
  muted: { fontSize: 13, color: Colors.textMuted, lineHeight: 18 },
  hint: { fontSize: 13, color: Colors.amberText, backgroundColor: Colors.amberBg, borderRadius: 10, padding: 10 },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
    paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  infoKey: { fontSize: 13, color: Colors.textMuted },
  infoVal: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary, flexShrink: 1, textAlign: 'right' },
  btn: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnPrimary: { backgroundColor: Colors.green },
  btnSecondary: { backgroundColor: Colors.grayBg },
  btnDanger: { backgroundColor: Colors.redBg },
  btnOff: { opacity: 0.45 },
  btnText: { fontSize: 14, fontWeight: '600' },
  fieldLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  input: {
    backgroundColor: Colors.grayBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12,
    fontSize: 14, color: Colors.textPrimary, minHeight: 46,
  },
  inputMulti: { minHeight: 90, textAlignVertical: 'top' },
  thumb: { width: 110, height: 110, borderRadius: 12, backgroundColor: Colors.grayBg },
  thumbLoading: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  thumbLoadingText: { fontSize: 11, color: Colors.textMuted },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, gap: 12 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '85%' },
  viewerHint: { color: '#fff', fontSize: 12, marginTop: 10 },
});
