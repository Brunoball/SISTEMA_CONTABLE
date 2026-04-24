import { StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

export const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F6F8FB',
  },

  gradientTop: {
    position: 'absolute',
    top: -110,
    right: -120,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#DCEBFF',
    opacity: 1,
  },

  gradientBottom: {
    position: 'absolute',
    bottom: -145,
    left: -135,
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: '#EAF2FF',
    opacity: 1,
  },

  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingVertical: 24,
  },

  card: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 34,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: '#DDE6F0',
    borderTopWidth: 5,
    borderTopColor: colors.primary,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },

  brandBox: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  logoImage: {
    width: '95%',
    height: 150,
    resizeMode: 'contain',
    alignSelf: 'center',
  },

  title: {
    color: '#071B33',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 0.4,
  },

  inputRow: {
    height: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D8E1EC',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    marginBottom: 18,
  },

  inputIcon: {
    marginRight: 13,
    opacity: 0.65,
  },

  input: {
    flex: 1,
    height: '100%',
    fontSize: 16,
    color: '#0F172A',
    paddingVertical: 0,
  },

  eyeButton: {
    width: 38,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -2,
    marginBottom: 20,
  },

  checkbox: {
    width: 31,
    height: 31,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: '#FFFFFF',
  },

  checkboxActive: {
    backgroundColor: colors.primary,
  },

  rememberText: {
    color: '#334155',
    fontSize: 16,
    fontWeight: '500',
  },

  button: {
    height: 56,
    borderRadius: 7,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },

  buttonDisabled: {
    opacity: 0.68,
  },

  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.4,
  },

  forgotButton: {
    marginTop: 24,
    alignItems: 'center',
  },

  forgotText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 15,
  },

  footer: {
    marginTop: 20,
    alignItems: 'center',
  },

  footerText: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
  },
});