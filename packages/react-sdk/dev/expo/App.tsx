import React from "react";
import { Button, SafeAreaView, StyleSheet, Text, View } from "react-native";

import {
  ReflagProvider,
  useFlag,
  useIsLoading,
} from "@reflag/react-sdk";

const publishableKey =
  process.env.EXPO_PUBLIC_REFLAG_PUBLISHABLE_KEY ?? "";
const isConfigured = publishableKey.length > 0;

function FlagCard() {
  const isLoading = useIsLoading();
  const { isEnabled, track } = useFlag("expo-demo");

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>expo-demo</Text>
      <Text style={styles.cardBody}>
        Status: {isLoading ? "loading" : isEnabled ? "enabled" : "disabled"}
      </Text>
      <Button title="Track usage" onPress={() => void track()} />
    </View>
  );
}

export default function App() {
  return (
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
