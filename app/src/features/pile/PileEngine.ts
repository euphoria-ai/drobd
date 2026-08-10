/**
 * Rigid-body simulation behind the Inventory pile.
 *
 * Owns a matter-js world and writes every body's transform into a single
 * shared buffer each frame. Skia reads that buffer on the UI thread, so the
 * per-frame cost is one write regardless of how many items are in the pile --
 * the alternative, a shared value per sprite, would put 150 writes a frame
 * across the boundary.
 */

import Matter from 'matter-js';

import { pile as pileConfig } from '../../theme/tokens';

/** Floats per body in the transform buffer: x, y, angle, scale, alpha. */
export const STRIDE = 5;

export interface PileBodySpec {
  id: string;
  /** Aspect ratio (width / height) of the sprite, for body proportions. */
  aspect: number;
}

export interface PileBounds {
  width: number;
  height: number;
}

interface TrackedBody {
  id: string;
  body: Matter.Body;
  halfWidth: number;
  halfHeight: number;
  /** Wall-clock ms after which the body starts falling in. */
  dropAt: number;
}

export class PileEngine {
  private engine: Matter.Engine;
  private walls: Matter.Body[] = [];
  private tracked: TrackedBody[] = [];
  private bounds: PileBounds = { width: 0, height: 0 };
  private lastStep = 0;

  constructor() {
    this.engine = Matter.Engine.create({
      // Sleeping is what makes a settled pile nearly free. Without it, 150
      // bodies keep resolving contacts forever and the frame budget is gone
      // before anything is drawn.
      enableSleeping: true,
    });
    this.engine.gravity.scale = 0.001;
  }

  setBounds(bounds: PileBounds): void {
    this.bounds = bounds;
    this.rebuildWalls();
  }

  /**
   * Walls and floor. Deliberately no ceiling: items drop in from above the
   * viewport, which is what makes switching categories read as a fresh pour
   * rather than a list re-rendering.
   */
  private rebuildWalls(): void {
    const { width, height } = this.bounds;
    if (width === 0 || height === 0) return;

    Matter.Composite.remove(this.engine.world, this.walls);

    const thickness = 200;
    const floorY = height * pileConfig.groundY;

    this.walls = [
      Matter.Bodies.rectangle(width / 2, floorY + thickness / 2, width * 3, thickness, {
        isStatic: true,
        friction: pileConfig.friction,
      }),
      Matter.Bodies.rectangle(-thickness / 2, height / 2, thickness, height * 4, {
        isStatic: true,
      }),
      Matter.Bodies.rectangle(width + thickness / 2, height / 2, thickness, height * 4, {
        isStatic: true,
      }),
    ];

    Matter.Composite.add(this.engine.world, this.walls);
  }

  /**
   * Replace the pile's contents.
   *
   * Everything currently simulated is discarded and the new set is dropped in
   * with a stagger, so a category switch pours rather than snaps.
   */
  setBodies(specs: PileBodySpec[]): void {
    const { width } = this.bounds;
    if (width === 0) return;

    Matter.Composite.remove(
      this.engine.world,
      this.tracked.map((entry) => entry.body),
    );
    this.tracked = [];

    const capped = specs.slice(0, pileConfig.maxBodies);
    const now = Date.now();

    capped.forEach((spec, index) => {
      const longest = width * pileConfig.spriteScale;
      const spriteWidth = spec.aspect >= 1 ? longest : longest * spec.aspect;
      const spriteHeight = spec.aspect >= 1 ? longest / spec.aspect : longest;

      const body = Matter.Bodies.rectangle(
        // Spread the drop across the middle of the canvas so the pile builds
        // into a mound instead of a column.
        width * 0.2 + Math.random() * width * 0.6,
        // Start above the viewport; the stagger below releases them in turn.
        -spriteHeight - Math.random() * 400,
        spriteWidth * 0.86, // slightly inset: cutouts rarely fill their box
        spriteHeight * 0.86,
        {
          restitution: pileConfig.restitution,
          friction: pileConfig.friction,
          frictionAir: pileConfig.frictionAir,
          angle: (Math.random() - 0.5) * 0.6,
          sleepThreshold: 30,
        },
      );

      // Held still until its turn, otherwise every item lands simultaneously.
      Matter.Body.setStatic(body, true);

      this.tracked.push({
        id: spec.id,
        body,
        halfWidth: spriteWidth / 2,
        halfHeight: spriteHeight / 2,
        dropAt: now + index * pileConfig.dropStaggerMs,
      });
    });

    Matter.Composite.add(
      this.engine.world,
      this.tracked.map((entry) => entry.body),
    );
  }

  /** Gravity direction, normally driven by the accelerometer. */
  setGravity(x: number, y: number): void {
    this.engine.gravity.x = x;
    this.engine.gravity.y = y;
  }

  /**
   * Advance the simulation and fill `out` with per-body transforms.
   *
   * `out` is laid out as [x, y, angle, scale, alpha] per body, matching STRIDE.
   * Returns the number of bodies written.
   */
  step(out: Float32Array, now: number): number {
    // Clamp the delta so a dropped frame or a backgrounded app doesn't
    // teleport the pile through the floor on resume.
    const delta = this.lastStep === 0 ? 16.667 : Math.min(32, now - this.lastStep);
    this.lastStep = now;

    const wallClock = Date.now();
    for (const entry of this.tracked) {
      if (entry.body.isStatic && wallClock >= entry.dropAt) {
        Matter.Body.setStatic(entry.body, false);
      }
    }

    Matter.Engine.update(this.engine, delta);

    let count = 0;
    for (const entry of this.tracked) {
      if (count * STRIDE + STRIDE > out.length) break;

      const offset = count * STRIDE;
      out[offset] = entry.body.position.x;
      out[offset + 1] = entry.body.position.y;
      out[offset + 2] = entry.body.angle;
      out[offset + 3] = 1;
      // Fade in as it is released, so items appear rather than pop.
      out[offset + 4] = entry.body.isStatic ? 0 : 1;
      count += 1;
    }

    return count;
  }

  /** Ids in the same order as the transform buffer. */
  getOrder(): string[] {
    return this.tracked.map((entry) => entry.id);
  }

  /** Half-extents in the same order, so the renderer can size each sprite. */
  getExtents(): { halfWidth: number; halfHeight: number }[] {
    return this.tracked.map((entry) => ({
      halfWidth: entry.halfWidth,
      halfHeight: entry.halfHeight,
    }));
  }

  /** Hit test, for tapping an item in the pile. Topmost body wins. */
  bodyAt(x: number, y: number): string | null {
    for (let index = this.tracked.length - 1; index >= 0; index -= 1) {
      const entry = this.tracked[index];
      if (Matter.Bounds.contains(entry.body.bounds, { x, y })) {
        return entry.id;
      }
    }
    return null;
  }

  /** Nudge everything awake, e.g. on a shake. */
  wake(): void {
    for (const entry of this.tracked) {
      if (!entry.body.isStatic) {
        Matter.Sleeping.set(entry.body, false);
      }
    }
  }

  destroy(): void {
    Matter.Composite.clear(this.engine.world, false);
    Matter.Engine.clear(this.engine);
    this.tracked = [];
    this.walls = [];
  }
}
