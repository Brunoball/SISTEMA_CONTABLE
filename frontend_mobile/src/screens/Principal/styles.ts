import { StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

export const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 24,
  },
  header: {
    marginBottom: 22,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  title: {
    color: colors.white,
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    marginTop: 6,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
  },
  cardText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  moduleGrid: {
    gap: 12,
  },
  moduleButton: {
    backgroundColor: '#F8FAFC',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  moduleTitle: {
    color: colors.primaryDark,
    fontWeight: '900',
    fontSize: 16,
  },
  moduleText: {
    color: colors.muted,
    marginTop: 4,
    fontSize: 13,
  },
  logout: {
    marginTop: 'auto',
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: colors.white,
    fontWeight: '900',
  },
});
