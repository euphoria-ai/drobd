/**
 * Capture flow: photograph an item, cut it out, name it, save it.
 *
 * Four states in one screen rather than four routes, because the whole point is
 * that it reads as a single continuous motion -- shutter, reveal, confirm.
 * Routing between them would put a navigation transition in the middle of that.
 */

import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCreateItem } from '../data/items';
import { ApiTimeout, ApiUnreachable, processImage, type ProcessResult } from '../lib/api';
import { CATEGORIES, type Category } from '../lib/taxonomy';
import { useTheme } from '../theme';
import { Button, IconButton } from '../ui/Button';
import { ChipRow } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/Pressable';
import { Screen, SectionLabel } from '../ui/Screen';
import { Text } from '../ui/Text';

type Phase = 'camera' | 'processing' | 'success' | 'details' | 'error';

/** Longest edge sent to the server. Larger costs upload time for no accuracy. */
const UPLOAD_MAX_EDGE = 1600;

export default function CaptureScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { source } = useLocalSearchParams<{ source?: string }>();

  const [phase, setPhase] = useState<Phase>('camera');
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<ProcessResult | null>(null);

  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);

  const createItem = useCreateItem();

  const run = useCallback(async (uri: string) => {
    setPhase('processing');
    try {
      // Downscale before upload: phone captures are 12MP and the server caps
      // its working size anyway, so sending the original is pure latency.
      const context = ImageManipulator.manipulate(uri);
      context.resize({ width: UPLOAD_MAX_EDGE });
      const rendered = await context.renderAsync();
      const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });

      const processed = await processImage(saved.uri);
      setResult(processed);
      setPhase('success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);

      // Let the reveal breathe before the form slides up.
      setTimeout(() => setPhase('details'), 900);
    } catch (error) {
      // A timeout and a dead service reject identically at the fetch layer, so
      // they are separated in lib/api. Keep them separate here too: telling
      // someone to check their network when the service is merely slow sends
      // them after the wrong problem.
      setErrorMessage(
        error instanceof ApiTimeout || error instanceof ApiUnreachable
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Something went wrong.',
      );
      setPhase('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    }
  }, []);

  const pickFromLibrary = useCallback(async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsMultipleSelection: false,
    });
    if (!picked.canceled && picked.assets[0]) {
      await run(picked.assets[0].uri);
    }
  }, [run]);

  // Entering from the gallery button skips the viewfinder entirely.
  useEffect(() => {
    if (source === 'library') {
      pickFromLibrary();
    }
  }, [source, pickFromLibrary]);

  const shutter = useCallback(async () => {
    if (!cameraReady) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    const photo = await cameraRef.current?.takePictureAsync({ quality: 1 });
    if (photo?.uri) await run(photo.uri);
  }, [cameraReady, run]);

  if (phase === 'details' && result) {
    return (
      <DetailsForm
        result={result}
        saving={createItem.isPending}
        onCancel={() => router.back()}
        onSave={async (values) => {
          try {
            await createItem.mutateAsync({
              ...values,
              dominantColor: result.dominantColor,
              confidence: result.confidence,
              cutoutPngBase64: result.cutoutPngBase64,
              width: result.width,
              height: result.height,
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
              () => undefined,
            );
            router.back();
          } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Could not save.');
            setPhase('error');
          }
        }}
      />
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          paddingHorizontal: theme.space.lg,
        }}
      >
        <IconButton name="close" variant="bare" accessibilityLabel="Close" onPress={() => router.back()} />
      </View>

      {phase === 'error' ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: theme.space.xxxl,
            gap: theme.space.md,
          }}
        >
          <Text variant="heading" center>
            Couldn&apos;t process that
          </Text>
          <Text variant="small" color="textMuted" center>
            {errorMessage}
          </Text>
          <Button label="Try again" onPress={() => setPhase('camera')} style={{ marginTop: theme.space.lg }} />
        </View>
      ) : phase === 'success' && result ? (
        <SuccessReveal result={result} />
      ) : phase === 'processing' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space.lg }}>
          <ActivityIndicator color={theme.colors.textMuted} />
          <Text variant="micro" color="textFaint">
            Cutting it out
          </Text>
        </View>
      ) : (
        <Viewfinder
          cameraRef={cameraRef}
          permission={permission?.granted ?? false}
          onRequestPermission={requestPermission}
          onReady={() => setCameraReady(true)}
          onShutter={shutter}
          onPickLibrary={pickFromLibrary}
        />
      )}
    </Screen>
  );
}

function Viewfinder({
  cameraRef,
  permission,
  onRequestPermission,
  onReady,
  onShutter,
  onPickLibrary,
}: {
  cameraRef: React.RefObject<CameraView | null>;
  permission: boolean;
  onRequestPermission: () => void;
  onReady: () => void;
  onShutter: () => void;
  onPickLibrary: () => void;
}) {
  const theme = useTheme();

  if (!permission) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: theme.space.xxxl,
          gap: theme.space.md,
        }}
      >
        <Text variant="heading" center>
          Camera access
        </Text>
        <Text variant="small" color="textMuted" center>
          drobe needs the camera to photograph your items and cut them out.
        </Text>
        <Button label="Allow" onPress={onRequestPermission} style={{ marginTop: theme.space.lg }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ alignItems: 'center', gap: 4, paddingBottom: theme.space.xl }}>
        <Text variant="bodyStrong">Place the item in frame</Text>
        <Text variant="small" color="textMuted">
          A plain background gives the cleanest cut
        </Text>
      </View>

      <View
        style={{
          marginHorizontal: theme.space.xl,
          aspectRatio: 1,
          borderRadius: theme.radius.lg,
          overflow: 'hidden',
          backgroundColor: theme.colors.surface,
        }}
      >
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing="back"
          onCameraReady={onReady}
        />
      </View>

      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingHorizontal: theme.space.xxxl,
        }}
      >
        <IconButton name="image" accessibilityLabel="Choose from library" onPress={onPickLibrary} />

        <PressableScale onPress={onShutter} scaleTo={0.88}>
          <View
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            style={{
              width: 72,
              height: 72,
              borderRadius: theme.radius.pill,
              borderWidth: 2,
              borderColor: theme.colors.text,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.accentSurface,
              }}
            />
          </View>
        </PressableScale>

        {/* Keeps the shutter optically centred. */}
        <View style={{ width: 22 + theme.space.lg }} />
      </View>
    </View>
  );
}

/** The cutout drops onto the ground with a slight overshoot. */
function SuccessReveal({ result }: { result: ProcessResult }) {
  const theme = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(1, theme.motion.reveal);
  }, [progress, theme.motion.reveal]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { scale: 0.86 + progress.value * 0.14 },
      { translateY: (1 - progress.value) * -24 },
    ],
  }));

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space.xxl }}>
      <Animated.View entering={FadeIn.duration(theme.duration.fast)}>
        <Text variant="heading">Got it</Text>
      </Animated.View>
      <Animated.View style={style}>
        <Image
          source={{ uri: `data:image/png;base64,${result.cutoutPngBase64}` }}
          style={{ width: 240, height: 240 }}
          contentFit="contain"
        />
      </Animated.View>
    </View>
  );
}

interface DetailValues {
  name: string;
  category: Category;
  slot: ProcessResult['slot'];
  quantity: number;
  location: string | null;
  note: string | null;
}

function DetailsForm({
  result,
  saving,
  onSave,
  onCancel,
}: {
  result: ProcessResult;
  saving: boolean;
  onSave: (values: DetailValues) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(result.name);
  const [category, setCategory] = useState<Category>(result.category);
  const [quantity, setQuantity] = useState(1);
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');

  return (
    <Screen edges={['top']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: theme.space.lg,
        }}
      >
        <IconButton name="close" variant="bare" accessibilityLabel="Cancel" onPress={onCancel} />
        <Button
          label="Save"
          loading={saving}
          onPress={() =>
            onSave({
              name: name.trim() || 'item',
              category,
              slot: result.slot,
              quantity,
              location: location.trim() || null,
              note: note.trim() || null,
            })
          }
        />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + theme.space.xxxl }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: 'center', paddingVertical: theme.space.xl }}>
          <Image
            source={{ uri: `data:image/png;base64,${result.cutoutPngBase64}` }}
            style={{ width: 200, height: 200 }}
            contentFit="contain"
          />
        </View>

        <SectionLabel>Name</SectionLabel>
        <Field value={name} onChangeText={setName} placeholder="What is it?" autoFocus={false} />

        <View style={{ height: theme.space.xl }} />
        <SectionLabel>Category</SectionLabel>
        <ChipRow
          options={CATEGORIES}
          value={category}
          onChange={(next) => next && setCategory(next)}
          allLabel=""
        />

        <View style={{ height: theme.space.xl }} />
        <SectionLabel>Quantity</SectionLabel>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.space.xl,
            paddingHorizontal: theme.space.xl,
          }}
        >
          <IconButton
            name="minus"
            accessibilityLabel="Decrease quantity"
            onPress={() => setQuantity((current) => Math.max(1, current - 1))}
          />
          <Text variant="heading">{quantity}</Text>
          <IconButton
            name="plus"
            accessibilityLabel="Increase quantity"
            onPress={() => setQuantity((current) => current + 1)}
          />
        </View>

        <View style={{ height: theme.space.xl }} />
        <SectionLabel>Location</SectionLabel>
        <Field value={location} onChangeText={setLocation} placeholder="Where do you keep it?" />

        <View style={{ height: theme.space.xl }} />
        <SectionLabel>Note</SectionLabel>
        <Field value={note} onChangeText={setNote} placeholder="Anything worth remembering" multiline />
      </ScrollView>
    </Screen>
  );
}

function Field({
  value,
  onChangeText,
  placeholder,
  multiline,
  autoFocus,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  multiline?: boolean;
  autoFocus?: boolean;
}) {
  const theme = useTheme();

  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.textFaint}
      multiline={multiline}
      autoFocus={autoFocus}
      style={{
        marginHorizontal: theme.space.xl,
        paddingHorizontal: theme.space.lg,
        paddingVertical: theme.space.md + 2,
        minHeight: multiline ? 88 : undefined,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
        color: theme.colors.text,
        fontSize: theme.type.body.fontSize,
        letterSpacing: theme.type.body.letterSpacing,
        textAlignVertical: multiline ? 'top' : 'center',
      }}
    />
  );
}
