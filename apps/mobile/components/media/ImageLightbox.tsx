import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useTheme } from '@mei/ui';

export interface ImageLightboxProps {
  visible: boolean;
  imageUrl?: string;
  title?: string;
  onClose: () => void;
}

export function ImageLightbox({
  visible,
  imageUrl,
  title,
  onClose,
}: ImageLightboxProps) {
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.scrim}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close image preview"
          style={({ pressed }) => [
            styles.closeBtn,
            {
              top: theme.space.xl,
              right: theme.space.lg,
              borderRadius: theme.radius.pill,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <X size={24} strokeWidth={1.8} color="#FFFFFF" />
        </Pressable>

        <Pressable
          onPress={onClose}
          style={styles.imageArea}
          accessibilityRole="imagebutton"
          accessibilityLabel={title ? `${title} preview` : 'Image preview'}
        >
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.image}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          ) : null}
        </Pressable>

        {title ? (
          <Text
            style={[
              styles.title,
              {
                bottom: theme.space.xl,
                color: '#FFFFFF',
                fontSize: theme.type.size.body,
                fontWeight: theme.type.weight.medium as '500',
              },
            ]}
            numberOfLines={2}
          >
            {title}
          </Text>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
  },
  imageArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 72,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  closeBtn: {
    position: 'absolute',
    zIndex: 2,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  title: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '86%',
    textAlign: 'center',
  },
});
