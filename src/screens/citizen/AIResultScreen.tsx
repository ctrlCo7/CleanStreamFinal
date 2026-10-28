import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { useT } from '../../hooks/useT';
import { ThemeColors } from '../../constants/theme';
import { AIWasteType, RootStackParamList, SeverityLevel } from '../../types';
import { WASTE_TYPE_LABELS } from '../../services/wasteAnalysis';
import { useAppSettings } from '../../services/appSettings';
import { HOTSPOT_MIN_REPORTS } from '../../services/reportProximity';
import { PHOTO_ISSUE_TEXT } from '../../services/waterwayAssessment';
import { setCitizenWasteType } from '../../services/reportsService';
import { withTimeout } from '../../utils/async';
import { formatArea, formatVolume } from '../../utils/units';
import { BackIcon, CheckIcon } from '../../components/common/TabIcons';

type Props = NativeStackScreenProps<RootStackParamList, 'CitizenAIResult'>;

const WASTE_TYPE_OPTIONS = Object.keys(WASTE_TYPE_LABELS) as AIWasteType[];
const LEVEL_FILL: Record<SeverityLevel, number> = { low: 0.2, moderate: 0.45, high: 0.72, critical: 1 };

export default function CitizenAIResultScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const { t, ai: tx, lang } = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { report } = route.params;
  const ai = report.aiAnalysis;
  const locale = lang === 'en' ? 'en-PH' : 'fil-PH';

  const levelColor = (l: SeverityLevel) =>
    l === 'critical' ? colors.critical : l === 'high' ? colors.red : l === 'moderate' ? colors.amber : colors.teal;
  const levelBg = (l: SeverityLevel) =>
    l === 'critical' ? colors.criticalBg : l === 'high' ? colors.redBg : l === 'moderate' ? colors.amberBg : colors.tealLight;
  const levelText = (l: SeverityLevel) =>
    l === 'critical' ? colors.criticalText : l === 'high' ? colors.redText : l === 'moderate' ? colors.amberText : colors.tealDark;
  const levelName = (l: SeverityLevel) => t(`level.${l}`);

  // Reporter's own answer to "what is this waste?" -- saved on the report so reviewers
  // see it, and kept apart from the AI's output so the two can be compared for training.
  const unavailable = ai?.analysisSource === 'unavailable';
  // Below the Super Admin's review threshold, the reporter is asked what the waste is.
  const { aiReviewThreshold } = useAppSettings();
  const lowConf = !ai || unavailable || ai.confidence < aiReviewThreshold || !ai.detectedObjects?.length;
  const aiTopType = (ai?.wasteTypes?.[0]?.type as AIWasteType | undefined) ?? 'mixed_waste';
  const [choice, setChoice] = useState<AIWasteType | null>(report.citizenWasteType ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [showObjects, setShowObjects] = useState(false);

  const saveChoice = async (type: AIWasteType) => {
    setSaving(true);
    setSaveError(false);
    try {
      await withTimeout(setCitizenWasteType(report.id, type), 10000, 'Saving waste type');
      setChoice(type);
      setPickerOpen(false);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  if (!ai) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.noAI}>{t('result.awaitingReview')}</Text>
      </SafeAreaView>
    );
  }

  const sev = ai.severityLevel;
  const sevColor = levelColor(sev);
  const ww = ai.waterway;
  const base = ai.baseSeverityScore ?? ai.severityScore;
  const factors = ww?.severityFactors ?? [];
  const rain = ww?.rain;

  // Severity ring: an arc proportional to the score.
  const R = 40;
  const C = 2 * Math.PI * R;
  const arc = (Math.max(0, Math.min(100, ai.severityScore)) / 100) * C;

  const risks: Array<{ label: string; level: SeverityLevel; hint: string }> = ww ? [
    { label: t('risk.blockage'), level: ww.blockage.level, hint: t('risk.blockageHint') },
    { label: t('risk.flood'), level: ww.floodRisk, hint: t(ww.rainySeason ? 'risk.floodHintRainy' : 'risk.floodHint') },
    { label: t('risk.spread'), level: ww.spreadRisk, hint: t('risk.spreadHint', { n: ww.floatableShare }) },
    { label: t('risk.contamination'), level: ww.contamination.level, hint: t('risk.contaminationHint') },
  ] : [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <BackIcon size={18} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>{t('result.title')}</Text>
          <Text style={styles.headerSub}>{report.reportNumber}</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Photo hero */}
        <View style={styles.hero}>
          {!!report.photoURL && <Image source={{ uri: report.photoURL }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
          <View style={styles.heroShade} />
          <View style={styles.heroTop}>
            <View style={[styles.heroPill, { backgroundColor: sevColor }]}>
              <Text style={styles.heroPillText}>{t('result.severityPill', { level: levelName(sev) })}</Text>
            </View>
            {!unavailable && (
              <View style={styles.heroPillGhost}>
                <Text style={styles.heroPillText}>{t('result.confidence', { n: ai.confidence })}</Text>
              </View>
            )}
          </View>
          <View style={styles.heroBottom}>
            <Text style={styles.heroTitle}>
              {unavailable ? t('result.awaitingReview') : ai.wasteTypes[0]?.label ?? t('result.noWaste')}
            </Text>
            <Text style={styles.heroSub}>
              {[
                ai.objectCount ? (ai.objectCount === 1 ? t('result.itemOne') : t('result.itemMany', { n: ai.objectCount })) : null,
                ww && ww.context !== 'unknown' ? t(`ctx.${ww.context}`) : null,
                report.location?.barangay,
              ].filter(Boolean).join(' · ') || t('result.analyzedOnDevice')}
            </Text>
          </View>
        </View>

        {/* Notices that change how to read the result */}
        {unavailable && (
          <View style={[styles.notice, { backgroundColor: colors.amberBg, borderColor: colors.amber }]}>
            <Text style={[styles.noticeTitle, { color: colors.amberText }]}>
              {t(ai.modelVersion === 'Skipped by reporter' ? 'result.skippedTitle'
                : ai.modelVersion === 'AI turned off by the administrator' ? 'result.disabledTitle' : 'result.unavailableTitle')}
            </Text>
            <Text style={[styles.noticeText, { color: colors.amberText }]}>{t('result.unavailableBody')}</Text>
          </View>
        )}
        {report.duplicateOfNumber && (
          <View style={[styles.notice, { backgroundColor: colors.purpleBg, borderColor: colors.purple }]}>
            <Text style={[styles.noticeTitle, { color: colors.purpleText }]}>{t('result.duplicateTitle')}</Text>
            <Text style={[styles.noticeText, { color: colors.purpleText }]}>
              {t('result.duplicateBody', { number: report.duplicateOfNumber, m: report.duplicateDistanceM ?? '<50' })}
            </Text>
          </View>
        )}
        {(report.nearbyReportCount ?? 0) >= HOTSPOT_MIN_REPORTS && (
          <View style={[styles.notice, { backgroundColor: colors.redBg, borderColor: colors.red }]}>
            <Text style={[styles.noticeTitle, { color: colors.redText }]}>{t('result.hotspotTitle')}</Text>
            <Text style={[styles.noticeText, { color: colors.redText }]}>{t('result.hotspotBody', { n: report.nearbyReportCount ?? 0 })}</Text>
          </View>
        )}
        {ai.photoQuality && ai.photoQuality.level !== 'good' && (
          <View style={[styles.notice, { backgroundColor: colors.blueBg, borderColor: colors.blue }]}>
            <Text style={[styles.noticeTitle, { color: colors.blueText }]}>
              {t('result.photoQuality', { level: t(ai.photoQuality.level === 'poor' ? 'quality.poor' : 'quality.fair') })}
            </Text>
            <Text style={[styles.noticeText, { color: colors.blueText }]}>
              {ai.photoQuality.issues.map((i) => tx(PHOTO_ISSUE_TEXT[i])).join('. ')}. {t('result.photoTip')}
            </Text>
          </View>
        )}

        {/* Severity */}
        <View style={styles.card}>
          <Text style={styles.eyebrow}>{t('result.severity')}</Text>
          <View style={styles.sevRow}>
            <View style={styles.ringWrap}>
              <Svg width={100} height={100} viewBox="0 0 100 100">
                <Circle cx="50" cy="50" r={R} fill="none" stroke={colors.grayBg} strokeWidth="10" />
                <Circle
                  cx="50" cy="50" r={R} fill="none" stroke={sevColor} strokeWidth="10"
                  strokeDasharray={`${arc} ${C}`} strokeLinecap="round" transform="rotate(-90 50 50)"
                />
              </Svg>
              <View style={styles.ringCenter}>
                <Text style={[styles.ringScore, { color: sevColor }]}>{ai.severityScore}</Text>
                <Text style={styles.ringMax}>{t('result.of100')}</Text>
              </View>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.sevLevel, { color: sevColor }]}>{levelName(sev)}</Text>
              <Text style={styles.sevText}>{t(`sevText.${sev}`)}</Text>
            </View>
          </View>
          {(factors.length > 0 || base !== ai.severityScore) && (
            <View style={styles.breakdown}>
              <Text style={styles.breakdownTitle}>{t('result.why')}</Text>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>{t(unavailable ? 'result.placeholder' : 'result.detected')}</Text>
                <Text style={styles.breakdownPts}>{base}</Text>
              </View>
              {factors.map((f) => (
                <View key={f.label} style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>{tx(f.label)}</Text>
                  <Text style={[styles.breakdownPts, { color: colors.redText }]}>+{f.points}</Text>
                </View>
              ))}
              {base + factors.reduce((s, f) => s + f.points, 0) > 100 && (
                <Text style={styles.breakdownNote}>{t('result.capped')}</Text>
              )}
            </View>
          )}
        </View>

        {/* Waterway assessment */}
        {ww && (
          <View style={styles.card}>
            <Text style={styles.eyebrow}>{t('result.waterway')}</Text>
            <View style={styles.factGrid}>
              <View style={styles.fact}>
                <Text style={styles.factLabel}>{t('result.location')}</Text>
                <Text style={styles.factValue}>{t(ww.context === 'unknown' ? 'ctx.undetermined' : `ctx.${ww.context}`)}</Text>
                <Text style={styles.factHint}>
                  {ww.contextSource === 'reporter' ? t('result.asReported')
                    : ww.contextSource === 'ai' ? t('result.detectedInPhoto', { n: ww.waterLikelihood })
                      : t('result.notReported')}
                </Text>
              </View>
              <View style={styles.fact}>
                <Text style={styles.factLabel}>{t('result.waterAppearance')}</Text>
                <Text style={styles.factValue}>{ww.waterColor ? t(`water.${ww.waterColor}`) : t('result.notVisible')}</Text>
                <Text style={styles.factHint}>{t('result.visualOnly')}</Text>
              </View>
            </View>
            {rain && (
              <View style={[styles.rainRow, { backgroundColor: rain.level === 'heavy' ? colors.blueBg : colors.grayBg }]}>
                <Text style={styles.rainIcon}>{rain.level === 'none' ? '☀️' : rain.level === 'heavy' ? '⛈️' : '🌧️'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.factLabel}>{t('result.rain')}</Text>
                  <Text style={styles.factValue}>{t(`rain.${rain.level}`)}</Text>
                </View>
                {rain.level !== 'none' && <Text style={styles.factHint}>{t('result.rainAmount', { mm: Math.round(rain.next24hMm) })}</Text>}
              </View>
            )}
            <View style={styles.riskList}>
              {risks.map((r) => (
                <View key={r.label} style={styles.riskRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.riskLabel}>{r.label}</Text>
                    <Text style={styles.riskHint}>{r.hint}</Text>
                  </View>
                  <View style={styles.riskMeter}>
                    <View style={[styles.riskFill, { width: `${LEVEL_FILL[r.level] * 100}%` as never, backgroundColor: levelColor(r.level) }]} />
                  </View>
                  <View style={[styles.levelPill, { backgroundColor: levelBg(r.level) }]}>
                    <Text style={[styles.levelPillText, { color: levelText(r.level) }]}>{levelName(r.level)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Health risks */}
        {ww && ww.healthRisks.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.eyebrow}>{t('result.health')}</Text>
            {ww.healthRisks.map((h) => (
              <View key={h} style={styles.bulletRow}>
                <View style={[styles.bulletDot, { backgroundColor: colors.red }]} />
                <Text style={styles.bulletText}>{tx(h)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Response plan */}
        <View style={styles.card}>
          <Text style={styles.eyebrow}>{t('result.response')}</Text>
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{ai.teamNeeded}</Text>
              <Text style={styles.statLabel}>{t('result.crew')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{formatVolume(ai.estimatedVolume)}</Text>
              <Text style={styles.statLabel}>{t('result.volume')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{formatArea(ai.spreadArea)}</Text>
              <Text style={styles.statLabel}>{t('result.area')}</Text>
            </View>
          </View>
          <View style={[styles.priorityBar, { backgroundColor: levelBg(sev) }]}>
            <Text style={[styles.priorityText, { color: levelText(sev) }]}>{tx(ai.cleanupPriority)}</Text>
          </View>
          {ww && ww.actions.length > 0 && (
            <View style={{ gap: 8, marginTop: 4 }}>
              {ww.actions.map((a, i) => (
                <View key={a} style={styles.stepRow}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                  <Text style={styles.stepText}>{tx(a)}</Text>
                </View>
              ))}
            </View>
          )}
          {ww && ww.equipment.length > 0 && (
            <>
              <Text style={styles.subTitle}>{t('result.bring')}</Text>
              <View style={styles.tagWrap}>
                {ww.equipment.map((e) => (
                  <View key={e} style={styles.tag}><Text style={styles.tagText}>{tx(e)}</Text></View>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Classification */}
        {ai.wasteTypes.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.eyebrow}>{t('result.classification')}</Text>
              {ai.cnnResult && <Text style={styles.cardHeadMeta}>{ai.cnnResult.label}</Text>}
            </View>
            {ai.wasteTypes.map((wt) => (
              <View key={wt.type} style={styles.classRow}>
                <Text style={styles.className}>{wt.label}</Text>
                <View style={styles.classTrack}>
                  <View style={[styles.classFill, { width: `${wt.percentage}%` as never, backgroundColor: wt.color }]} />
                </View>
                <Text style={styles.classPct}>{wt.percentage}%</Text>
              </View>
            ))}
            {ai.detectedObjects && ai.detectedObjects.length > 0 && (
              <>
                <TouchableOpacity onPress={() => setShowObjects((s) => !s)} style={{ marginTop: 4 }}>
                  <Text style={styles.link}>{t(showObjects ? 'result.hideItems' : 'result.showItems', { n: ai.detectedObjects.length })}</Text>
                </TouchableOpacity>
                {showObjects && ai.detectedObjects.map((o, i) => (
                  <View key={`${o.label}-${i}`} style={styles.objRow}>
                    <View style={[styles.objDot, { backgroundColor: o.color }]} />
                    <Text style={styles.objLabel}>{o.label}</Text>
                    <Text style={styles.objConf}>{o.confidence}%</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        )}

        {/* Reporter confirms or corrects the waste type */}
        <View style={[styles.card, lowConf && !choice && { borderWidth: 1.5, borderColor: colors.amber }]}>
          {choice ? (
            <>
              <Text style={styles.correctTitle}>{t('result.youIdentified', { type: WASTE_TYPE_LABELS[choice] })}</Text>
              <Text style={styles.correctSub}>{t('result.savedHelp')}</Text>
              {!pickerOpen && (
                <TouchableOpacity onPress={() => setPickerOpen(true)}>
                  <Text style={styles.link}>{t('result.change')}</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              <Text style={styles.correctTitle}>
                {lowConf ? t('result.whatKind') : t('result.isRight', { type: WASTE_TYPE_LABELS[aiTopType] })}
              </Text>
              <Text style={styles.correctSub}>{t(lowConf ? 'result.lowConfHelp' : 'result.confirmHelp')}</Text>
              {!lowConf && !pickerOpen && (
                <View style={styles.btnRow}>
                  <TouchableOpacity style={styles.btnPrimary} disabled={saving} onPress={() => saveChoice(aiTopType)}>
                    <Text style={styles.btnPrimaryText}>{t('result.looksRight')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnSecondary} onPress={() => setPickerOpen(true)}>
                    <Text style={styles.btnSecondaryText}>{t('result.change')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
          {(pickerOpen || (lowConf && !choice)) && (
            <View style={styles.tagWrap}>
              {WASTE_TYPE_OPTIONS.map((wt) => (
                <TouchableOpacity
                  key={wt}
                  style={[styles.chip, choice === wt && styles.chipOn]}
                  disabled={saving}
                  onPress={() => saveChoice(wt)}
                >
                  <Text style={[styles.chipText, choice === wt && styles.chipTextOn]}>{WASTE_TYPE_LABELS[wt]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {saveError && <Text style={styles.error}>{t('result.saveError')}</Text>}
        </View>

        {/* Disposal */}
        {ai.recommendations && ai.recommendations.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.eyebrow}>{t('result.disposal')}</Text>
            {ai.recommendations.map((rec, idx) => {
              const u: SeverityLevel = rec.urgency === 'immediate' ? 'high' : rec.urgency === 'scheduled' ? 'moderate' : 'low';
              return (
                <View key={`${rec.wasteType}-${idx}`} style={[styles.recRow, idx > 0 && styles.recDivider]}>
                  <Text style={styles.recIcon}>{rec.icon}</Text>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={styles.recHead}>
                      <Text style={styles.recTitle}>{rec.wasteLabel}</Text>
                      <View style={[styles.levelPill, { backgroundColor: levelBg(u) }]}>
                        <Text style={[styles.levelPillText, { color: levelText(u) }]}>{t(`urgency.${rec.urgency}`)}</Text>
                      </View>
                    </View>
                    <Text style={styles.recAction}>{rec.action}</Text>
                    <Text style={styles.recFacility}>{rec.facility}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Submitted */}
        <View style={styles.doneCard}>
          <CheckIcon color={colors.tealDark} size={16} />
          <View style={{ flex: 1 }}>
            <Text style={styles.doneTitle}>{t('result.submitted')}</Text>
            <Text style={styles.doneSub}>
              {t('result.capturedInApp')} · {report.location?.accuracy != null ? `GPS ±${Math.round(report.location.accuracy)} m` : t('result.locationRecorded')} · {new Date(report.capturedAt ?? report.createdAt).toLocaleString(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </Text>
          </View>
        </View>
        <Text style={styles.footnote}>
          {unavailable ? t('result.footNoModel') : t('result.footModel', { model: ai.modelVersion })} {t('result.footRule')}
        </Text>

        <TouchableOpacity
          style={styles.historyBtn}
          onPress={() => navigation.navigate('CitizenTabs', { screen: 'CitizenHistory' } as never)}
        >
          <Text style={styles.historyBtnText}>{t('result.history')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const card = (Colors: ThemeColors) => ({
  backgroundColor: Colors.surface,
  borderRadius: 18,
  padding: 16,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: Colors.border,
  shadowColor: Colors.shadow,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.05,
  shadowRadius: 12,
  elevation: 1,
});

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  noAI: { textAlign: 'center', marginTop: 40, color: Colors.textMuted },
  header: {
    backgroundColor: Colors.surface, paddingHorizontal: 16, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  headerSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 12, paddingBottom: 32 },

  hero: { height: 210, borderRadius: 20, overflow: 'hidden', backgroundColor: Colors.tealDeep, justifyContent: 'space-between' },
  heroShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.38)' },
  heroTop: { flexDirection: 'row', gap: 6, padding: 12 },
  heroPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  heroPillGhost: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.22)' },
  heroPillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  heroBottom: { padding: 14 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 3 },

  notice: { borderRadius: 14, padding: 12, borderWidth: 1, gap: 3 },
  noticeTitle: { fontSize: 13, fontWeight: '700' },
  noticeText: { fontSize: 12, lineHeight: 17 },

  card: { ...card(Colors), gap: 10 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardHeadMeta: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: Colors.textMuted },
  subTitle: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginTop: 6 },
  link: { fontSize: 12, fontWeight: '700', color: Colors.teal },

  sevRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  ringWrap: { width: 100, height: 100, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringScore: { fontSize: 28, fontWeight: '800' },
  ringMax: { fontSize: 10, color: Colors.textMuted, marginTop: -2 },
  sevLevel: { fontSize: 20, fontWeight: '800' },
  sevText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  breakdown: { backgroundColor: Colors.grayBg, borderRadius: 12, padding: 12, gap: 6 },
  breakdownTitle: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between' },
  breakdownLabel: { fontSize: 12, color: Colors.textSecondary, flex: 1 },
  breakdownPts: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  breakdownNote: { fontSize: 11, color: Colors.textMuted },

  factGrid: { flexDirection: 'row', gap: 10 },
  fact: { flex: 1, backgroundColor: Colors.grayBg, borderRadius: 12, padding: 11, gap: 2 },
  factLabel: { fontSize: 11, color: Colors.textMuted },
  factValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  factHint: { fontSize: 10, color: Colors.textMuted },
  riskList: { gap: 12, marginTop: 2 },
  riskRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  riskLabel: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  riskHint: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  riskMeter: { width: 56, height: 6, borderRadius: 3, backgroundColor: Colors.grayBg, overflow: 'hidden' },
  riskFill: { height: '100%', borderRadius: 3 },
  levelPill: { minWidth: 64, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  levelPillText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },

  bulletRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  bulletText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },

  statRow: { flexDirection: 'row', backgroundColor: Colors.grayBg, borderRadius: 12, paddingVertical: 12 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textMuted },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: Colors.borderMid },
  priorityBar: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 },
  priorityText: { fontSize: 12, fontWeight: '700' },
  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.tealLight, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 11, fontWeight: '800', color: Colors.tealDark },
  stepText: { flex: 1, fontSize: 13, color: Colors.textPrimary, lineHeight: 18, paddingTop: 1 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.grayBg },
  tagText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },

  classRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  className: { width: 110, fontSize: 12, color: Colors.textPrimary, fontWeight: '500' },
  classTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: Colors.grayBg, overflow: 'hidden' },
  classFill: { height: '100%', borderRadius: 4 },
  classPct: { width: 38, textAlign: 'right', fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  objRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  objDot: { width: 8, height: 8, borderRadius: 4 },
  objLabel: { flex: 1, fontSize: 12, color: Colors.textSecondary },
  objConf: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },

  correctTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  correctSub: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  btnRow: { flexDirection: 'row', gap: 8 },
  btnPrimary: { flex: 1, backgroundColor: Colors.teal, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  btnSecondary: { flex: 1, backgroundColor: Colors.grayBg, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  btnSecondaryText: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.grayBg },
  chipOn: { backgroundColor: Colors.teal },
  chipText: { fontSize: 12, color: Colors.textPrimary },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  error: { fontSize: 12, color: Colors.red },

  recRow: { flexDirection: 'row', gap: 10, paddingTop: 2 },
  recDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border, paddingTop: 10 },
  recIcon: { fontSize: 20, marginTop: 1 },
  recHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  recTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  recAction: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  recFacility: { fontSize: 11, color: Colors.textMuted },

  doneCard: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: Colors.tealLight, borderRadius: 14, padding: 12 },
  doneTitle: { fontSize: 13, fontWeight: '700', color: Colors.tealDark },
  doneSub: { fontSize: 11, color: Colors.tealDark, opacity: 0.85, marginTop: 1 },
  rainRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 11 },
  rainIcon: { fontSize: 22 },
  footnote: { fontSize: 11, color: Colors.textMuted, lineHeight: 16, paddingHorizontal: 2 },
  historyBtn: { backgroundColor: Colors.teal, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  historyBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
