import React, { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { clearAuth, getJson, STORAGE_KEYS } from '../../auth/storage';
import { styles } from './styles';

type Usuario = {
  nombre?: string;
  rol?: string;
  plan_nivel?: number;
};

const modules = [
  { title: 'Dashboard', text: 'Resumen general del sistema.' },
  { title: 'Stock', text: 'Productos, categorías y movimientos.' },
  { title: 'Ventas', text: 'Carga rápida de ventas y comprobantes.' },
  { title: 'Cuentas corrientes', text: 'Clientes, proveedores y saldos.' },
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
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>BALTO MOBILE</Text>
          <Text style={styles.title}>Panel principal</Text>
          <Text style={styles.subtitle}>
            Hola {usuario?.nombre || 'usuario'}, tu sesión ya está conectada.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Primera versión mobile lista</Text>
          <Text style={styles.cardText}>
            Este panel confirma que el login contra el backend funcionó y que el session_key quedó guardado para consumir las próximas APIs.
          </Text>
        </View>

        <View style={[styles.card, styles.moduleGrid]}>
          <Text style={styles.cardTitle}>Módulos próximos</Text>
          {modules.map((m) => (
            <Pressable key={m.title} style={styles.moduleButton}>
              <Text style={styles.moduleTitle}>{m.title}</Text>
              <Text style={styles.moduleText}>{m.text}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.logout} onPress={cerrarSesion}>
          <Text style={styles.logoutText}>CERRAR SESIÓN</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
