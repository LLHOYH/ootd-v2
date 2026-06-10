// useWeatherLocationSync — opportunistically refresh device weather coords.
//
// Runs silently from Today. Permission denial simply leaves the backend on
// the profile-city fallback; a successful sync asks Today to refetch so the
// weather strip can use the fresh location.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';

import { upsertWeatherLocation } from '../api/me';
import { useSession } from '../auth/SessionProvider';

const STORAGE_KEY_PREFIX = 'mei-weather-location:last-sync:';
const SYNC_INTERVAL_MS = 30 * 60 * 1000;
const LOCATION_PRECISION = 1000;

function roundedCoordinate(value: number): number {
  return Math.round(value * LOCATION_PRECISION) / LOCATION_PRECISION;
}

function cityFromGeocode(place: Location.LocationGeocodedAddress | undefined): string | undefined {
  const city = place?.city ?? place?.subregion ?? place?.region;
  const trimmed = city?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function useWeatherLocationSync(onSynced?: () => void | Promise<void>): void {
  const { session, loading: sessionLoading } = useSession();
  const userId = session?.user.id;
  const onSyncedRef = useRef(onSynced);

  useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  useEffect(() => {
    if (sessionLoading || !userId) return;
    let cancelled = false;
    const storageKey = `${STORAGE_KEY_PREFIX}${userId}`;

    (async () => {
      const lastSyncRaw = await AsyncStorage.getItem(storageKey);
      const lastSync = lastSyncRaw ? Number(lastSyncRaw) : 0;
      if (Number.isFinite(lastSync) && Date.now() - lastSync < SYNC_INTERVAL_MS) {
        return;
      }

      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status === Location.PermissionStatus.UNDETERMINED) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (cancelled || permission.status !== Location.PermissionStatus.GRANTED) return;

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (cancelled) return;

      const latitude = roundedCoordinate(position.coords.latitude);
      const longitude = roundedCoordinate(position.coords.longitude);
      let city: string | undefined;
      try {
        const places = await Location.reverseGeocodeAsync({ latitude, longitude });
        city = cityFromGeocode(places[0]);
      } catch {
        // Coordinates are enough for provider-backed weather; city is a nice
        // fallback label when the provider key is absent.
      }
      if (cancelled) return;

      await upsertWeatherLocation({ latitude, longitude, ...(city ? { city } : {}) });
      await AsyncStorage.setItem(storageKey, String(Date.now()));
      if (!cancelled) await onSyncedRef.current?.();
    })().catch(() => {
      // Weather location is opportunistic; keep Today on its existing fallback.
    });

    return () => {
      cancelled = true;
    };
  }, [sessionLoading, userId]);
}
