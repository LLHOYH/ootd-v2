// Sign-in screen — email + password.
//
// The success path doesn't navigate anywhere itself: SessionProvider's
// onAuthStateChange listener fires, the gate in app/index.tsx redirects
// to /today, and this screen unmounts. That keeps deep-link handling
// (e.g. cold-launching from a push notification) trivially correct —
// the gate is the only place that decides "where does a logged-in user
// land".

import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Screen, useTheme } from '@mei/ui';

import { AuthField } from '@/components/auth/AuthField';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);

  const canSubmit =
    email.trim().length > 0 && password.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setTopError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (error) {
      // Common Supabase signals: "Invalid login credentials",
      // "Email not confirmed". Surface verbatim — they're already
      // user-readable.
      setTopError(error.message);
      return;
    }
    // Success: SessionProvider fires onAuthStateChange → app/index.tsx
    // gate redirects. No router push here.
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: theme.space.xxxl,
            paddingBottom: theme.space.xxxl,
            gap: theme.space.lg,
          }}
        >
          <View>
            <Text
              style={{
                color: theme.color.text.primary,
                fontSize: theme.type.size.h1,
                fontWeight: theme.type.weight.medium as '500',
              }}
            >
              Welcome back
            </Text>
            <Text
              style={{
                color: theme.color.text.tertiary,
                fontSize: theme.type.size.body,
                fontWeight: theme.type.weight.regular as '400',
                marginTop: theme.space.xs,
              }}
            >
              Sign in to your closet.
            </Text>
          </View>

          <View style={{ gap: theme.space.md }}>
            <AuthField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              kind="email"
              autoFocus
            />
            <AuthField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              kind="password"
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
            />
          </View>

          {topError ? (
            <View
              style={[
                styles.errorBanner,
                {
                  backgroundColor: theme.color.brandBg,
                  borderRadius: theme.radius.sm,
                  padding: theme.space.md,
                },
              ]}
            >
              <Text
                style={{
                  color: theme.color.brandOn,
                  fontSize: theme.type.size.tiny,
                  fontWeight: theme.type.weight.regular as '400',
                }}
              >
                {topError}
              </Text>
            </View>
          ) : null}

          <Button variant="primary" onPress={handleSubmit} disabled={!canSubmit}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>

          <View style={[styles.altRow, { gap: theme.space.xs }]}>
            <Text
              style={{
                color: theme.color.text.tertiary,
                fontSize: theme.type.size.caption,
                fontWeight: theme.type.weight.regular as '400',
              }}
            >
              No account yet?
            </Text>
            <Pressable
              onPress={() => router.push('/(auth)/sign-up' as never)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Create an account"
            >
              <Text
                style={{
                  color: theme.color.brand,
                  fontSize: theme.type.size.caption,
                  fontWeight: theme.type.weight.medium as '500',
                }}
              >
                Create one
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  errorBanner: {
    width: '100%',
  },
  altRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
  },
});
