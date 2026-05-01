// Sign-up screen — email + password + display name.
//
// We rely on the auth-trigger seeded in 0004_auth_user_sync.sql to mirror
// auth.users → public.users on signup, deriving the username from the
// email local-part and pulling display_name from user_metadata. So all
// this screen does is call supabase.auth.signUp and trust the trigger.

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
import { ChevronLeft } from 'lucide-react-native';
import { Button, Screen, useTheme } from '@mei/ui';

import { AuthField } from '@/components/auth/AuthField';
import { supabase } from '@/lib/supabase';

const MIN_PASSWORD = 8;

export default function SignUpScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [confirmEmailHint, setConfirmEmailHint] = useState(false);

  // Per-field errors, computed lazily on submit so the user isn't yelled at
  // mid-typing.
  const [fieldErrors, setFieldErrors] = useState<{
    displayName?: string;
    email?: string;
    password?: string;
  }>({});

  const validate = (): boolean => {
    const errs: typeof fieldErrors = {};
    if (displayName.trim().length === 0) errs.displayName = 'Required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs.email = 'Enter a valid email';
    if (password.length < MIN_PASSWORD)
      errs.password = `At least ${MIN_PASSWORD} characters`;
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const canSubmit =
    !submitting &&
    displayName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (!validate()) return;
    setSubmitting(true);
    setTopError(null);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: displayName.trim() },
      },
    });
    setSubmitting(false);
    if (error) {
      setTopError(error.message);
      return;
    }
    // When email confirmation is enabled (default on Supabase hosted),
    // signUp returns a user but no session — the user has to click the
    // link before they can sign in. Show a soft hint instead of letting
    // them stare at a screen that does nothing.
    if (!data.session) {
      setConfirmEmailHint(true);
      return;
    }
    // If the project disabled email confirmation, signUp returns a
    // session immediately and the gate redirects.
  };

  if (confirmEmailHint) {
    return (
      <Screen>
        <View style={[styles.center, { gap: theme.space.md, padding: theme.space.lg }]}>
          <Text
            style={{
              color: theme.color.text.primary,
              fontSize: theme.type.size.h1,
              fontWeight: theme.type.weight.medium as '500',
              textAlign: 'center',
            }}
          >
            Check your email
          </Text>
          <Text
            style={{
              color: theme.color.text.tertiary,
              fontSize: theme.type.size.body,
              fontWeight: theme.type.weight.regular as '400',
              textAlign: 'center',
            }}
          >
            We sent a confirmation link to{`\n`}
            <Text style={{ color: theme.color.text.primary }}>{email.trim()}</Text>.{`\n`}
            Tap it, then sign in.
          </Text>
          <Button
            variant="primary"
            onPress={() => router.replace('/(auth)/sign-in' as never)}
          >
            Back to sign in
          </Button>
        </View>
      </Screen>
    );
  }

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
            paddingTop: theme.space.lg,
            paddingBottom: theme.space.xxxl,
            gap: theme.space.lg,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.backBtn}
          >
            <ChevronLeft size={24} strokeWidth={1.6} color={theme.color.text.primary} />
          </Pressable>

          <View>
            <Text
              style={{
                color: theme.color.text.primary,
                fontSize: theme.type.size.h1,
                fontWeight: theme.type.weight.medium as '500',
              }}
            >
              Create your account
            </Text>
            <Text
              style={{
                color: theme.color.text.tertiary,
                fontSize: theme.type.size.body,
                fontWeight: theme.type.weight.regular as '400',
                marginTop: theme.space.xs,
              }}
            >
              Stella will help you dress.
            </Text>
          </View>

          <View style={{ gap: theme.space.md }}>
            <AuthField
              label="Display name"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="What should we call you?"
              kind="name"
              autoFocus
              {...(fieldErrors.displayName
                ? { errorMessage: fieldErrors.displayName }
                : {})}
            />
            <AuthField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              kind="email"
              {...(fieldErrors.email ? { errorMessage: fieldErrors.email } : {})}
            />
            <AuthField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder={`At least ${MIN_PASSWORD} characters`}
              kind="password"
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
              {...(fieldErrors.password
                ? { errorMessage: fieldErrors.password }
                : {})}
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
            {submitting ? 'Creating…' : 'Create account'}
          </Button>

          <Text
            style={{
              color: theme.color.text.tertiary,
              fontSize: theme.type.size.tiny,
              fontWeight: theme.type.weight.regular as '400',
              textAlign: 'center',
            }}
          >
            By creating an account you agree to our terms and privacy.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    width: '100%',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
