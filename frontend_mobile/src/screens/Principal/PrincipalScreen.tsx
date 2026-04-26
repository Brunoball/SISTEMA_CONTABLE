import React, { useEffect, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { clearAuth, getJson, STORAGE_KEYS } from '../../auth/storage';
import { styles } from './styles';

type Usuario = {
  nombre?: string;
  rol?: string;
  plan_nivel?: number;
};

const modules = [
  { title: 'Dashboard', text: 'Resumen general del sistema.', emoji: '📊' },
  { title: 'Stock', text: 'Productos, categorías y movimientos.', emoji: '📦' },
  { title: 'Ventas', text: 'Carga rápida de ventas y comprobantes.', emoji: '💰' },
  { title: 'Cuentas corrientes', text: 'Clientes, proveedores y saldos.', emoji: '📋' },
];

export default function PrincipalScreen() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);

  useEffect(() => {
    getJson<Usuario>(STORAGE_KEYS.usuario).then(setUsuario);
  }, []);

  const cerrarSesion = async () => {
    await clearAuth();
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.eyebrow}>BALTO MOBILE</Text>
          <Text style={styles.title}>Panel principal</Text>
          <Text style={styles.subtitle}>
            Hola{' '}
            <Text style={styles.subtitleName}>
              {usuario?.nombre || 'usuario'}
            </Text>
            , tu sesión está activa.
          </Text>
        </View>

        {/* Status card */}
        <View style={styles.statusCard}>
          <View style={styles.statusDot} />
          <View style={styles.statusTextWrap}>
            <Text style={styles.statusTitle}>Sistema conectado</Text>
            <Text style={styles.statusText}>
              El session_key está guardado y listo para consumir las APIs.
            </Text>
          </View>
        </View>

        {/* Info card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>VERSIÓN ACTUAL</Text>
          <Text style={styles.cardTitle}>Primera versión mobile lista</Text>
          <Text style={styles.cardText}>
            Este panel confirma que el login contra el backend funcionó
            correctamente.
          </Text>
        </View>

        {/* Modules */}
        <Text style={styles.sectionLabel}>MÓDULOS PRÓXIMOS</Text>
        <View style={styles.moduleGrid}>
          {modules.map((m) => (
            <Pressable
              key={m.title}
              style={({ pressed }) => [
                styles.moduleButton,
                pressed && styles.moduleButtonPressed,
              ]}
            >
              <Text style={styles.moduleEmoji}>{m.emoji}</Text>
              <Text style={styles.moduleTitle}>{m.title}</Text>
              <Text style={styles.moduleText}>{m.text}</Text>
            </Pressable>
          ))}
        </View>

        {/* Logout */}
        <Pressable
          style={({ pressed }) => [
            styles.logout,
            pressed && styles.logoutPressed,
          ]}
          onPress={cerrarSesion}
        >
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}