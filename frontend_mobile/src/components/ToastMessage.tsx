import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

type TipoToast = 'exito' | 'error' | 'advertencia' | 'info';

type Props = {
  tipo?: TipoToast;
  mensaje: string;
};

export default function ToastMessage({ tipo = 'info', mensaje }: Props) {
  const backgroundColor =
    tipo === 'exito'
      ? colors.success
      : tipo === 'error'
        ? colors.danger
        : tipo === 'advertencia'
          ? colors.warning
          : colors.primary;

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Text style={styles.text}>{mensaje}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: 54,
    zIndex: 50,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  text: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
