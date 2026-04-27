import React from 'react';
import { ScrollView, StatusBar, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';

export interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: ViewStyle;
}

export function Screen({ children, scroll = false, padded = true, style }: ScreenProps) {
  const theme = useTheme();
  const Container: React.ComponentType<any> = scroll ? ScrollView : View;
  const innerStyle: ViewStyle = {
    flex: scroll ? undefined : 1,
    paddingHorizontal: padded ? theme.space.lg : 0,
    paddingTop: padded ? theme.space.lg : 0,
  };

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.safe, { backgroundColor: theme.color.bg.primary }, style]}
    >
      <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />
      <Container
        style={scroll ? undefined : innerStyle}
        contentContainerStyle={scroll ? innerStyle : undefined}
      >
        {children}
      </Container>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});
