import { StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

export const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 40,
  },

  /* ── Header ── */
  header: {
    marginBottom: 28,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.50)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 6,
  },
  title: {
    color: colors.white,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 15,
    marginTop: 8,
    lineHeight: 22,
  },
  subtitleName: {
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '700',
  },

  /* ── Status card ── */
  statusCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: 'rgba(34, 173, 92, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 173, 92, 0.28)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22AD5C',
    marginTop: 4,
    flexShrink: 0,
  },
  statusTextWrap: {
    flex: 1,
  },
  statusTitle: {
    color: '#22AD5C',
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 2,
  },
  statusText: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 13,
    lineHeight: 18,
  },

  /* ── Info card ── */
  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 20,
    marginBottom: 24,
  },
  cardLabel: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  cardTitle: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 8,
    lineHeight: 22,
  },
  cardText: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 14,
    lineHeight: 20,
  },

  /* ── Modules ── */
  sectionLabel: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  moduleGrid: {
    gap: 10,
    marginBottom: 32,
  },
  moduleButton: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 18,
  },
  moduleButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  moduleEmoji: {
    fontSize: 22,
    marginBottom: 8,
  },
  moduleTitle: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 15,
    marginBottom: 3,
  },
  moduleText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    lineHeight: 18,
  },

  /* ── Logout ── */
  logout: {
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  logoutPressed: {
    backgroundColor: 'rgba(225, 61, 69, 0.15)',
    borderColor: 'rgba(225, 61, 69, 0.35)',
  },
  logoutText: {
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.5,
  },
});