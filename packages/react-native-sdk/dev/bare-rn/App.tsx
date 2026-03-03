import React, { useMemo } from 'react';
import {
  Button,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
  ReflagProvider,
  useClient,
  useFlag,
  useIsLoading,
} from '@reflag/react-native-sdk';

const publishableKey = 'pub_prod_vxuM5hSZOnhzvAfiOnZ9rj';
const isConfigured = publishableKey.length > 0;

type CheckStatus = 'pass' | 'warn' | 'fail';

interface RuntimeCheck {
  label: string;
  status: CheckStatus;
  details: string;
}

function runRuntimeChecks(): RuntimeCheck[] {
  const checks: RuntimeCheck[] = [];

  const hasURL = typeof URL !== 'undefined';
  checks.push({
    label: 'global URL',
    status: hasURL ? 'pass' : 'fail',
    details: hasURL ? 'available' : 'missing',
  });

  const hasURLSearchParams = typeof URLSearchParams !== 'undefined';
  checks.push({
    label: 'global URLSearchParams',
    status: hasURLSearchParams ? 'pass' : 'fail',
    details: hasURLSearchParams ? 'available' : 'missing',
  });

  if (hasURL) {
    const descriptor = Object.getOwnPropertyDescriptor(URL.prototype, 'search');
    checks.push({
      label: 'URL.search setter',
      status: descriptor?.set ? 'pass' : 'warn',
      details: descriptor?.set
        ? 'setter present'
        : 'getter-only URL.search (older RN behavior)',
    });
  }

  try {
    const url = new URL('/probe', 'https://front.reflag.com');
    url.searchParams.set('check', 'ok');
    const href = url.toString();
    checks.push({
      label: 'URL + searchParams behavior',
      status: href.includes('check=ok') ? 'pass' : 'fail',
      details: href,
    });
  } catch (error) {
    checks.push({
      label: 'URL + searchParams behavior',
      status: 'fail',
      details: String(error),
    });
  }

  checks.push({
    label: 'global EventSource (auto feedback only)',
    status: typeof EventSource !== 'undefined' ? 'pass' : 'warn',
    details:
      typeof EventSource !== 'undefined'
        ? 'available'
        : 'missing: keep feedback.enableAutoFeedback=false',
  });

  return checks;
}

function RuntimeChecksCard() {
  const checks = useMemo(() => runRuntimeChecks(), []);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Runtime Checks</Text>
      {checks.map(check => (
        <View key={check.label} style={styles.checkRow}>
          <Text
            style={[
              styles.checkStatus,
              check.status === 'pass'
                ? styles.statusPass
                : check.status === 'warn'
                  ? styles.statusWarn
                  : styles.statusFail,
            ]}
          >
            {check.status.toUpperCase()}
          </Text>
          <View style={styles.checkBody}>
            <Text style={styles.checkLabel}>{check.label}</Text>
            <Text style={styles.checkDetails}>{check.details}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function FlagCard() {
  const client = useClient();
  const isLoading = useIsLoading();
  const { isEnabled, track } = useFlag('bare-rn-demo');

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Flag: bare-rn-demo</Text>
      <Text style={styles.cardBody}>
        Status: {isLoading ? 'loading' : isEnabled ? 'enabled' : 'disabled'}
      </Text>
      <View style={styles.buttonRow}>
        <Button title="Track usage" onPress={() => void track()} />
        <Button title="Refresh" onPress={() => void client.refresh()} />
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.container}>
        <ReflagProvider
          publishableKey={publishableKey || 'demo'}
          offline={!isConfigured}
          fallbackFlags={['bare-rn-demo']}
          context={{
            user: { id: 'bare-rn-user', name: 'Bare RN User' },
            other: { platform: 'react-native-bare' },
          }}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Reflag Bare RN Smoke App</Text>
            <Text style={styles.subtitle}>
              {isConfigured
                ? 'Connected to Reflag'
                : 'Offline mode (set publishableKey in App.tsx to fetch real flags)'}
            </Text>
          </View>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <RuntimeChecksCard />
            <FlagCard />
          </ScrollView>
        </ReflagProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#f8fafc',
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e8f0',
  },
  cardBody: {
    fontSize: 14,
    color: '#cbd5f5',
  },
  buttonRow: {
    gap: 12,
  },
  checkRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  checkStatus: {
    fontSize: 12,
    fontWeight: '700',
    minWidth: 42,
  },
  statusPass: {
    color: '#22c55e',
  },
  statusWarn: {
    color: '#f59e0b',
  },
  statusFail: {
    color: '#ef4444',
  },
  checkBody: {
    flex: 1,
    gap: 2,
  },
  checkLabel: {
    fontSize: 13,
    color: '#e2e8f0',
  },
  checkDetails: {
    fontSize: 12,
    color: '#94a3b8',
  },
});
