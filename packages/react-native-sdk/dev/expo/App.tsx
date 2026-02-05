import React, { useEffect, useRef } from "react";
import { AppState, Button, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import {
  ReflagProvider,
  useClient,
  useFlag,
  useIsLoading,
} from "@reflag/react-native-sdk";

const publishableKey = process.env.EXPO_PUBLIC_REFLAG_PUBLISHABLE_KEY ?? "";
const isConfigured = publishableKey.length > 0;

function FlagCard() {
  const client = useClient();
  const isLoading = useIsLoading();
  const { isEnabled, track } = useFlag("expo-demo");

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>expo-demo</Text>
      <Text style={styles.cardBody}>
        Status: {isLoading ? "loading" : isEnabled ? "enabled" : "disabled"}
      </Text>
      <View style={styles.buttonRow}>
        <Button title="Track usage" onPress={() => void track()} />
        <Button title="Refresh" onPress={() => void client.refresh()} />
      </View>
    </View>
  );
}

export default function App() {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        console.log("App came to foreground");
        // Your global logic here
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <ReflagProvider
          publishableKey={publishableKey || "demo"}
          offline={!isConfigured}
          fallbackFlags={["expo-demo"]}
          context={{
            user: { id: "expo-user", name: "Expo User" },
            other: { platform: "react-native" },
          }}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Reflag React SDK + Expo</Text>
            <Text style={styles.subtitle}>
              {isConfigured
                ? "Connected to Reflag"
                : "Set EXPO_PUBLIC_REFLAG_PUBLISHABLE_KEY to fetch real flags"}
            </Text>
          </View>
          <FlagCard />
        </ReflagProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    padding: 20,
    gap: 20,
  },
  header: {
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    color: "#f8fafc",
  },
  subtitle: {
    fontSize: 14,
    color: "#94a3b8",
  },
  card: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  buttonRow: {
    gap: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#e2e8f0",
  },
  cardBody: {
    fontSize: 14,
    color: "#cbd5f5",
  },
});
