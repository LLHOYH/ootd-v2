import { Tabs, useRouter, useSegments } from 'expo-router';
import { BottomNav, type BottomNavTab } from '@mei/ui';

const TAB_ROUTES: Record<Exclude<BottomNavTab, 'stella'>, string> = {
  today: '/today',
  closet: '/closet',
  chats: '/chats',
  you: '/you',
};

function resolveActive(segments: string[]): BottomNavTab {
  const last = segments[segments.length - 1];
  if (last === 'closet') return 'closet';
  if (last === 'chats') return 'chats';
  if (last === 'you') return 'you';
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
          onSelect={(tab) => {
            if (tab === 'stella') {
              router.push('/stella');
              return;
            }
            router.navigate(TAB_ROUTES[tab] as never);
          }}
        />
      )}
    >
      <Tabs.Screen name="today" />
      <Tabs.Screen name="closet" />
      <Tabs.Screen name="chats" />
      <Tabs.Screen name="you" />
    </Tabs>
  );
}
