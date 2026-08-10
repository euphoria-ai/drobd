/**
 * Device tilt as a gravity vector.
 *
 * Tilting the phone should pour the pile, which is the single interaction that
 * makes the Inventory tab feel like a physical object rather than a grid. Raw
 * accelerometer output is far too noisy to use directly -- fed straight in, a
 * pile at rest visibly buzzes -- so it is low-pass filtered and clamped.
 */

import { Accelerometer } from 'expo-sensors';
import { useEffect, useRef } from 'react';

import { pile as pileConfig } from '../../theme/tokens';

export interface GravityVector {
  x: number;
  y: number;
}

/**
 * Returns a ref holding the current gravity vector.
 *
 * A ref rather than state on purpose: this updates 60 times a second and is
 * read by the physics loop, so re-rendering on every sample would be pure
 * waste.
 */
export function useTiltGravity(enabled = true) {
  const gravity = useRef<GravityVector>({ x: 0, y: 1 });

  useEffect(() => {
    if (!enabled) {
      gravity.current = { x: 0, y: 1 };
      return;
    }

    Accelerometer.setUpdateInterval(16);

    const subscription = Accelerometer.addListener(({ x, y }) => {
      const clamp = pileConfig.tiltGravityMax;
      const smoothing = pileConfig.tiltSmoothing;

      // Screen y grows downward while the sensor's y grows toward the top of
      // the device, hence the negation. Holding the phone upright must read as
      // ordinary downward gravity.
      const targetX = Math.max(-clamp, Math.min(clamp, x));
      const targetY = Math.max(-clamp, Math.min(clamp, -y));

      gravity.current = {
        x: gravity.current.x + (targetX - gravity.current.x) * smoothing,
        y: gravity.current.y + (targetY - gravity.current.y) * smoothing,
      };
    });

    return () => subscription.remove();
  }, [enabled]);

  return gravity;
}
