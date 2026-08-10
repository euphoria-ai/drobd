/**
 * Press feedback that runs entirely on the UI thread.
 *
 * React Native's own `Pressable` opacity feedback goes through the JS thread,
 * so it stutters exactly when the app is busy -- which is when the user is most
 * likely to be tapping. These use Reanimated worklets, so the scale responds
 * even while the pile is simulating or a capture is uploading.
 */

import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { motion } from '../theme/tokens';

export interface PressableScaleProps {
  onPress?: () => void;
  onLongPress?: () => void;
  /** How far to shrink on press. Small controls need less to read as pressed. */
  scaleTo?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
  children: React.ReactNode;
}

export function PressableScale({
  onPress,
  onLongPress,
  scaleTo = 0.96,
  disabled,
  style,
  hitSlop = 8,
  children,
}: PressableScaleProps) {
  const pressed = useSharedValue(0);

  const gesture = React.useMemo(() => {
    const tap = Gesture.Tap()
      .enabled(!disabled)
      // Without this a slow press is cancelled, which feels broken on a
      // deliberate tap.
      .maxDuration(10_000)
      .hitSlop({ top: hitSlop, bottom: hitSlop, left: hitSlop, right: hitSlop })
      .onBegin(() => {
        pressed.value = withSpring(1, motion.snappy);
      })
      .onFinalize((_event, success) => {
        pressed.value = withSpring(0, motion.snappy);
        // Only the callback crosses to JS; the animation stays on the UI thread.
        if (success && onPress) runOnJS(onPress)();
      });

    const longPress = Gesture.LongPress()
      .enabled(!disabled && Boolean(onLongPress))
      .minDuration(400)
      .onStart(() => {
        if (onLongPress) runOnJS(onLongPress)();
      });

    return Gesture.Exclusive(longPress, tap);
  }, [disabled, hitSlop, onLongPress, onPress, pressed]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }],
    opacity: 1 - pressed.value * 0.12,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[style, { opacity: disabled ? 0.4 : 1 }, animatedStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
