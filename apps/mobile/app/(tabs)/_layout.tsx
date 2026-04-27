import { Tabs, useRouter, useSegments } from 'expo-router';
import { BottomNav, type BottomNavTab } from '@mei/ui';

const TAB_ROUTES: Record<BottomNavTab, string> = {
  today: '/today',
  closet: '/closet',
  friends: '/friends',
  chats: '/chats',
  you: '/you',
};

function resolveActive(segments: string[]): BottomNavTab {
  // Tab is the segment immediately after the `(tabs)` group, so chat detail
  // pushes (`/chats/stella`) keep the Chats tab highlighted.
  const tabsIndex = segments.indexOf('(tabs)');
  const tab = tabsIndex >= 0 ? segments[tabsIndex + 1] : segments[0];
  if (tab === 'closet') return 'closet';
  if (tab === 'friends') return 'friends';
  if (tab === 'chats') return 'chats';
  if (tab === 'you') return 'you';
  return 'today';
}

export default function TabsLayout() {
  const router = useRouter();
  const segments = useSegments();
  const active = resolveActive(segments as string[]);

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={() => (
        <BottomNav
          active={active}
          onSelect={(tab) => router.navigate(TAB_ROUTES[tab] as never)}
        />
      )}
    >
      <Tabs.Screen name="today" />
      <Tabs.Screen name="closet" />
      <Tabs.Screen name="friends" />
      <Tabs.Screen name="chats" />
      <Tabs.Screen name="you" />
    </Tabs>
  );
}
