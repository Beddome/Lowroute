import React, { useState, useRef, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, Platform, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";

interface LocationPickerProps {
  latitude: number;
  longitude: number;
  onLocationChange: (lat: number, lng: number) => void;
  accentColor?: string;
  label?: string;
}

function safeParse(text: string, fallback: number): number {
  const val = parseFloat(text);
  return Number.isFinite(val) ? val : fallback;
}

function WebLocationPicker({
  latitude,
  longitude,
  onLocationChange,
  accentColor = Colors.accent,
  label = "Enter coordinates for the location",
}: LocationPickerProps) {
  const [latText, setLatText] = useState(String(latitude));
  const [lngText, setLngText] = useState(String(longitude));

  useEffect(() => {
    setLatText(String(latitude));
    setLngText(String(longitude));
  }, [latitude, longitude]);

  const updateLat = (text: string) => {
    setLatText(text);
    const val = parseFloat(text);
    if (Number.isFinite(val)) onLocationChange(val, safeParse(lngText, longitude));
  };
  const updateLng = (text: string) => {
    setLngText(text);
    const val = parseFloat(text);
    if (Number.isFinite(val)) onLocationChange(safeParse(latText, latitude), val);
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Ionicons name="location" size={16} color={accentColor} />
        <Text style={styles.labelText}>{label}</Text>
      </View>
      <View style={styles.webInputRow}>
        <View style={styles.webInputGroup}>
          <Text style={styles.webInputLabel}>Latitude</Text>
          <TextInput
            style={styles.webInput}
            value={latText}
            onChangeText={updateLat}
            keyboardType="numeric"
            placeholderTextColor={Colors.textMuted}
          />
        </View>
        <View style={styles.webInputGroup}>
          <Text style={styles.webInputLabel}>Longitude</Text>
          <TextInput
            style={styles.webInput}
            value={lngText}
            onChangeText={updateLng}
            keyboardType="numeric"
            placeholderTextColor={Colors.textMuted}
          />
        </View>
      </View>
    </View>
  );
}

function NativeLocationPicker({
  latitude,
  longitude,
  onLocationChange,
  accentColor = Colors.accent,
  label = "Tap the map or drag the pin to set location",
}: LocationPickerProps) {
  const MapView = require("react-native-maps").default;
  const { Marker, PROVIDER_DEFAULT } = require("react-native-maps");

  const mapRef = useRef<any>(null);
  const [markerCoord, setMarkerCoord] = useState({
    latitude,
    longitude,
  });

  useEffect(() => {
    setMarkerCoord({ latitude, longitude });
    mapRef.current?.animateToRegion({
      latitude,
      longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 500);
  }, [latitude, longitude]);

  const handleMapPress = useCallback(
    (e: any) => {
      const { latitude: lat, longitude: lng } = e.nativeEvent.coordinate;
      setMarkerCoord({ latitude: lat, longitude: lng });
      onLocationChange(lat, lng);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [onLocationChange],
  );

  const handleMarkerDragEnd = useCallback(
    (e: any) => {
      const { latitude: lat, longitude: lng } = e.nativeEvent.coordinate;
      setMarkerCoord({ latitude: lat, longitude: lng });
      onLocationChange(lat, lng);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [onLocationChange],
  );

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Ionicons name="location" size={16} color={accentColor} />
        <Text style={styles.labelText}>{label}</Text>
      </View>
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          initialRegion={{
            latitude,
            longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          onPress={handleMapPress}
          showsUserLocation
          showsMyLocationButton={false}
          userInterfaceStyle="dark"
        >
          <Marker
            coordinate={markerCoord}
            draggable
            onDragEnd={handleMarkerDragEnd}
          >
            <View style={[styles.pinOuter, { borderColor: accentColor }]}>
              <View style={[styles.pinInner, { backgroundColor: accentColor }]}>
                <Ionicons name="location" size={18} color="#fff" />
              </View>
            </View>
            <View style={[styles.pinShadow, { backgroundColor: accentColor }]} />
          </Marker>
        </MapView>
        <View style={styles.coordBadge}>
          <Text style={styles.coordText}>
            {markerCoord.latitude.toFixed(5)}, {markerCoord.longitude.toFixed(5)}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function LocationPicker(props: LocationPickerProps) {
  if (Platform.OS === "web") {
    return <WebLocationPicker {...props} />;
  }
  return <NativeLocationPicker {...props} />;
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 0,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  labelText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
  },
  mapContainer: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
    height: 200,
  },
  map: {
    width: "100%",
    height: "100%",
  },
  pinOuter: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderRadius: 20,
    padding: 2,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  pinInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  pinShadow: {
    width: 10,
    height: 10,
    borderRadius: 5,
    alignSelf: "center",
    marginTop: -3,
    opacity: 0.4,
  },
  coordBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  coordText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#fff",
  },
  webInputRow: {
    flexDirection: "row",
    gap: 12,
  },
  webInputGroup: {
    flex: 1,
  },
  webInputLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
    marginBottom: 6,
  },
  webInput: {
    backgroundColor: Colors.bgInput,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});
