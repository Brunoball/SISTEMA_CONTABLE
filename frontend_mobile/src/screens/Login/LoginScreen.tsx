import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

import { LOGIN_ENDPOINT } from '../../config/apiConfig';
import { styles } from './styles';

const logoBalto = require('../../../assets/images/logo-balto.png');

export default function LoginScreen() {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [recordar, setRecordar] = useState(false);
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [cargando, setCargando] = useState(false);

  const iniciarSesion = async () => {
    if (!usuario.trim() || !password.trim()) {
      Alert.alert('Atención', 'Ingresá usuario y contraseña.');
      return;
    }

    try {
      setCargando(true);

      const response = await fetch(LOGIN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          usuario: usuario.trim(),
          password: password.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.exito) {
        Alert.alert('Error', data?.mensaje || 'No se pudo iniciar sesión.');
        return;
      }

      const sessionKey = data.session_key || data.sessionKey || data.token || '';
      const usuarioData = data.usuario || data.user || null;

      if (sessionKey) {
        await SecureStore.setItemAsync('session_key', String(sessionKey));
      }

      if (usuarioData) {
        await SecureStore.setItemAsync('usuario', JSON.stringify(usuarioData));
      }

      if (recordar) {
        await SecureStore.setItemAsync('usuario_recordado', usuario.trim());
      } else {
        await SecureStore.deleteItemAsync('usuario_recordado');
      }

      router.replace('/panel');
    } catch (error) {
      Alert.alert('Error', 'No se pudo conectar con el servidor.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.gradientTop} />
      <View style={styles.gradientBottom} />

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <View style={styles.brandBox}>
            <Image source={logoBalto} style={styles.logoImage} resizeMode="contain" />
          </View>

          <Text style={styles.title}>INICIAR SESIÓN</Text>

          <View style={styles.inputRow}>
            <Ionicons name="person-outline" size={23} color="#64748B" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Usuario"
              placeholderTextColor="#64748B"
              value={usuario}
              onChangeText={setUsuario}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={23} color="#64748B" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Contraseña"
              placeholderTextColor="#64748B"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!mostrarPassword}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
            />

            <Pressable
              style={styles.eyeButton}
              onPress={() => setMostrarPassword((prev) => !prev)}
            >
              <Ionicons
                name={mostrarPassword ? 'eye-off-outline' : 'eye-outline'}
                size={25}
                color="#64748B"
              />
            </Pressable>
          </View>

          <Pressable style={styles.rememberRow} onPress={() => setRecordar((prev) => !prev)}>
            <View style={[styles.checkbox, recordar && styles.checkboxActive]}>
              {recordar && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
            </View>
            <Text style={styles.rememberText}>Recordar cuenta</Text>
          </Pressable>

          <Pressable
            style={[styles.button, cargando && styles.buttonDisabled]}
            onPress={iniciarSesion}
            disabled={cargando}
          >
            {cargando ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>ACCEDER</Text>
            )}
          </Pressable>

          <Pressable style={styles.forgotButton}>
            <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}