import { Stack } from 'expo-router';

/**
 * Auth flow stack — sign-in / sign-up. Headers stay hidden because each
 * screen renders its own minimal header inline (back arrow + title where
 * needed).
 */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
    </Stack>
  );
}
