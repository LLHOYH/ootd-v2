// Bottom sheet shown when the user taps the FAB.
//
// Two affordances: camera or gallery. We use a plain Modal + dimmed
// backdrop instead of a third-party action sheet — keeps the dependency
// surface small and the styling stays inside the design tokens.

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, Image as ImageIcon, X } from 'lucide-react-native';
import { useTheme } from '@mei/ui';

export interface UploadSheetProps {
  visible: boolean;
  onClose: () => void;
  onPickCamera: () => void;
  onPickLibrary: () => void;
}

export function UploadSheet({
  visible,
  onClose,
  onPickCamera,
  onPickLibrary,
}: UploadSheetProps) {
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
        onPress={onClose}
      >
        <Pressable
          // Tap-through guard — taps inside the sheet shouldn't dismiss.
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.color.bg.primary,
              borderTopLeftRadius: theme.radius.lg,
              borderTopRightRadius: theme.radius.lg,
              paddingHorizontal: theme.space.lg,
              paddingTop: theme.space.lg,
              paddingBottom: theme.space.xl,
              gap: theme.space.md,
            },
          ]}
        >
          <View style={styles.headerRow}>
            <Text
              style={{
                color: theme.color.text.primary,
                fontSize: theme.type.size.h2,
                fontWeight: theme.type.weight.medium as '500',
              }}
            >
              Add a closet item
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.closeBtn}
            >
              <X size={20} strokeWidth={1.6} color={theme.color.text.tertiary} />
            </Pressable>
          </View>

          <Text
            style={{
              color: theme.color.text.tertiary,
              fontSize: theme.type.size.tiny,
              fontWeight: theme.type.weight.regular as '400',
            }}
          >
            Stella will tag and clean it up automatically.
          </Text>

          <View style={{ gap: theme.space.sm }}>
            <SheetOption
              icon={<Camera size={20} strokeWidth={1.6} color={theme.color.brandOn} />}
              label="Take a photo"
              onPress={onPickCamera}
            />
            <SheetOption
              icon={<ImageIcon size={20} strokeWidth={1.6} color={theme.color.brandOn} />}
              label="Choose from gallery"
              onPress={onPickLibrary}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface SheetOptionProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}

function SheetOption({ icon, label, onPress }: SheetOptionProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: theme.color.bg.secondary,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.space.md,
          paddingVertical: theme.space.md,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.iconBubble,
          {
            backgroundColor: theme.color.brand,
            borderRadius: 999,
          },
        ]}
      >
        {icon}
      </View>
      <Text
        style={{
          color: theme.color.text.primary,
          fontSize: theme.type.size.body,
          fontWeight: theme.type.weight.medium as '500',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBubble: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
