import { useEffect, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button, Chip, useTheme } from '@mei/ui';
import type {
  ClimateProfile,
  Gender,
  MyProfile,
  ProfileUpdateInput,
} from '@/lib/hooks/useMyProfile';

export interface EditProfileModalProps {
  visible: boolean;
  profile: MyProfile;
  saving?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSave: (input: ProfileUpdateInput) => void | Promise<void>;
}

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'F', label: 'Female' },
  { value: 'M', label: 'Male' },
  { value: 'NB', label: 'Non-binary' },
  { value: 'PNS', label: 'Prefer not' },
];

const CLIMATE_OPTIONS: { value: ClimateProfile; label: string }[] = [
  { value: 'TROPICAL', label: 'Tropical' },
  { value: 'TEMPERATE', label: 'Temperate' },
  { value: 'ARID', label: 'Arid' },
  { value: 'COLD', label: 'Cold' },
];

function tagsFromText(text: string): string[] {
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .slice(0, 12);
}

function birthYearFromText(text: string): number | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const year = Number(trimmed);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error('Birth year must be between 1900 and 2100');
  }
  return year;
}

export function EditProfileModal({
  visible,
  profile,
  saving = false,
  errorMessage = null,
  onClose,
  onSave,
}: EditProfileModalProps) {
  const theme = useTheme();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [gender, setGender] = useState<Gender | undefined>(profile.gender);
  const [birthYear, setBirthYear] = useState(
    profile.birthYear != null ? String(profile.birthYear) : '',
  );
  const [city, setCity] = useState(profile.city ?? '');
  const [climateProfile, setClimateProfile] = useState<ClimateProfile | undefined>(
    profile.climateProfile,
  );
  const [styleTags, setStyleTags] = useState(profile.stylePreferences.join(', '));
  const [discoverable, setDiscoverable] = useState(profile.discoverable);
  const [contributes, setContributes] = useState(profile.contributesToCommunityLooks);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDisplayName(profile.displayName);
    setGender(profile.gender);
    setBirthYear(profile.birthYear != null ? String(profile.birthYear) : '');
    setCity(profile.city ?? '');
    setClimateProfile(profile.climateProfile);
    setStyleTags(profile.stylePreferences.join(', '));
    setDiscoverable(profile.discoverable);
    setContributes(profile.contributesToCommunityLooks);
    setLocalError(null);
  }, [profile, visible]);

  const handleSave = () => {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setLocalError('Name is required');
      return;
    }

    let parsedBirthYear: number | undefined;
    try {
      parsedBirthYear = birthYearFromText(birthYear);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Invalid birth year');
      return;
    }

    setLocalError(null);
    void onSave({
      displayName: trimmedName,
      gender,
      birthYear: parsedBirthYear,
      city: city.trim() || undefined,
      climateProfile,
      stylePreferences: tagsFromText(styleTags),
      discoverable,
      contributesToCommunityLooks: contributes,
    });
  };

  const shownError = localError ?? errorMessage;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          onPress={saving ? undefined : onClose}
          style={[styles.scrim, { backgroundColor: theme.color.border.strong }]}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.sheet,
              {
                backgroundColor: theme.color.bg.primary,
                borderTopLeftRadius: theme.radius.lg,
                borderTopRightRadius: theme.radius.lg,
                padding: theme.space.lg,
              },
            ]}
          >
            <View style={[styles.header, { marginBottom: theme.space.md }]}>
              <Text
                style={{
                  color: theme.color.text.primary,
                  fontSize: theme.type.size.h2,
                  fontWeight: theme.type.weight.medium as '500',
                }}
              >
                Edit profile
              </Text>
              <Button variant="ghost" onPress={onClose} disabled={saving}>
                Cancel
              </Button>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: theme.space.md, paddingBottom: theme.space.lg }}
              showsVerticalScrollIndicator={false}
            >
              <Field label="Name">
                <ProfileInput
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Name"
                  maxLength={80}
                />
              </Field>

              <Field label="Gender">
                <View style={[styles.chips, { gap: theme.space.sm }]}>
                  {GENDER_OPTIONS.map((option) => (
                    <Chip
                      key={option.value}
                      active={gender === option.value}
                      onPress={() => setGender(gender === option.value ? undefined : option.value)}
                    >
                      {option.label}
                    </Chip>
                  ))}
                </View>
              </Field>

              <Field label="Birth year">
                <ProfileInput
                  value={birthYear}
                  onChangeText={setBirthYear}
                  placeholder="1996"
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </Field>

              <Field label="City">
                <ProfileInput
                  value={city}
                  onChangeText={setCity}
                  placeholder="Singapore"
                  maxLength={120}
                />
              </Field>

              <Field label="Climate">
                <View style={[styles.chips, { gap: theme.space.sm }]}>
                  {CLIMATE_OPTIONS.map((option) => (
                    <Chip
                      key={option.value}
                      active={climateProfile === option.value}
                      onPress={() =>
                        setClimateProfile(
                          climateProfile === option.value ? undefined : option.value,
                        )
                      }
                    >
                      {option.label}
                    </Chip>
                  ))}
                </View>
              </Field>

              <Field label="Style tags">
                <ProfileInput
                  value={styleTags}
                  onChangeText={setStyleTags}
                  placeholder="minimal, weekend, polished"
                  maxLength={180}
                />
              </Field>

              <ToggleRow
                title="Discoverable"
                subtitle="Appear in friend search"
                value={discoverable}
                onValueChange={setDiscoverable}
              />
              <ToggleRow
                title="Community looks"
                subtitle="Let opted-in looks appear on Today"
                value={contributes}
                onValueChange={setContributes}
              />

              {shownError ? (
                <Text
                  style={{
                    color: theme.color.danger,
                    fontSize: theme.type.size.tiny,
                    fontWeight: theme.type.weight.regular as '400',
                  }}
                >
                  {shownError}
                </Text>
              ) : null}

              <Button variant="primary" onPress={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save profile'}
              </Button>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface FieldProps {
  label: string;
  children: ReactNode;
}

function Field({ label, children }: FieldProps) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{
          color: theme.color.text.tertiary,
          fontSize: theme.type.size.tiny,
          fontWeight: theme.type.weight.medium as '500',
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

type ProfileInputProps = ComponentProps<typeof TextInput>;

function ProfileInput(props: ProfileInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      {...props}
      placeholderTextColor={theme.color.text.tertiary}
      autoCorrect={false}
      style={[
        styles.input,
        {
          backgroundColor: theme.color.bg.secondary,
          borderRadius: theme.radius.md,
          color: theme.color.text.primary,
          fontSize: theme.type.size.body,
          fontWeight: theme.type.weight.regular as '400',
          paddingHorizontal: theme.space.md,
        },
        props.style,
      ]}
    />
  );
}

interface ToggleRowProps {
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

function ToggleRow({ title, subtitle, value, onValueChange }: ToggleRowProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.toggleRow,
        {
          gap: theme.space.md,
          backgroundColor: theme.color.bg.secondary,
          borderRadius: theme.radius.md,
          padding: theme.space.md,
        },
      ]}
    >
      <View style={styles.toggleCopy}>
        <Text
          style={{
            color: theme.color.text.primary,
            fontSize: theme.type.size.body,
            fontWeight: theme.type.weight.medium as '500',
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: theme.color.text.tertiary,
            fontSize: theme.type.size.tiny,
            fontWeight: theme.type.weight.regular as '400',
            marginTop: 2,
          }}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.color.bg.tertiary, true: theme.color.brandBg }}
        thumbColor={value ? theme.color.brand : theme.color.text.tertiary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  input: {
    minHeight: 44,
    paddingVertical: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleCopy: {
    flex: 1,
  },
});
