/**
 * Tab shell.
 *
 * A custom bar rather than the default one: the stock bar draws a top border
 * and a filled active state, both of which fight the spare look. Here the
 * active tab is carried by opacity and a small dot, and the whole bar floats
 * over the ground with no divider.
 */

import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../theme';
import { Icon, IconName } from '../../ui/Icon';
import { PressableScale } from '../../ui/Pressable';
import { Text } from '../../ui/Text';

/**
 * Minimal shape of what expo-router hands a custom tab bar. Declared locally
 * rather than imported from @react-navigation/bottom-tabs, which is a
 * transitive dependency here and not something to take a direct type
 * dependency on.
 */
interface TabBarProps {
  state: {
    index: number;
    routes: { key: string; name: string }[];
  };
  navigation: {
    emit: (event: {
      type: 'tabPress';
      target: string;
      canPreventDefault: true;
    }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
}

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'index', label: 'Home', icon: 'home' },
  { name: 'outfit', label: 'Outfit', icon: 'shirt' },
  { name: 'inventory', label: 'Inventory', icon: 'archive' },
  { name: 'settings', label: 'Settings', icon: 'settings' },
];

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}

function FloatingTabBar({ state, navigation }: TabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: Math.max(insets.bottom, theme.space.md),
        paddingTop: theme.space.md,
        flexDirection: 'row',
        justifyContent: 'space-around',
        backgroundColor: theme.colors.ground,
      }}
    >
      {state.routes.map((route, index) => {
        const tab = TABS.find((candidate) => candidate.name === route.name);
        if (!tab) return null;

        const focused = state.index === index;

        return (
          <TabButton
            key={route.key}
            label={tab.label}
            icon={tab.icon}
            focused={focused}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
          />
        );
      })}
    </View>
  );
}

function TabButton({
  label,
  icon,
  focused,
  onPress,
}: {
  label: string;
  icon: IconName;
  focused: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const progress = useDerivedValue(() => withSpring(focused ? 1 : 0, theme.motion.snappy));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + progress.value * 0.6,
    transform: [{ translateY: -progress.value * 2 }],
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: progress.value }],
  }));

  return (
    <PressableScale onPress={onPress} scaleTo={0.9} style={{ flex: 1 }}>
      <View style={{ alignItems: 'center', gap: 4, paddingVertical: theme.space.xs }}>
        <Animated.View style={iconStyle}>
          <Icon name={icon} size={22} strokeWidth={focused ? 1.9 : 1.5} />
        </Animated.View>
        <Text variant="micro" color={focused ? 'text' : 'textFaint'}>
          {label}
        </Text>
        <Animated.View
          style={[
            { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.colors.text },
            dotStyle,
          ]}
        />
      </View>
    </PressableScale>
  );
}
