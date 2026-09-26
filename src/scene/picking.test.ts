import { afterEach, describe, expect, it } from 'vitest';
import { sim } from '../sim/sim';
import { pickBody } from './picking';
import '../sim/bodies';

/** Put bodies on screen: [id, x, y, radiusPx, magnitude, distCamera?]. Everything else is hidden. */
function scene(list: [string, number, number, number, number, number?][]) {
  for (const b of sim.bodyList) {
    b.present = true;
    b.screen.inFront = false;
    b.screen.onScreen = false;
  }
  for (const [id, x, y, r, mag, dist] of list) {
    const b = sim.bodies[id];
    b.screen.x = x;
    b.screen.y = y;
    b.screen.inFront = true;
    b.screen.onScreen = true;
    b.radiusPx = r;
    b.magnitude = mag;
    b.distCamera = dist ?? 1e9;
  }
}

afterEach(() => {
  for (const b of sim.bodyList) {
    b.present = true;
    b.screen.inFront = false;
  }
});

describe('pickBody', () => {
  it('takes the resolved disc under the pointer over any marker', () => {
    scene([
      ['earth', 400, 300, 120, -3],
      ['moon', 410, 300, 2, -12], // a marker right under the pointer, but on Earth's disc
    ]);
    expect(pickBody(405, 300)).toBe('earth');
  });

  it('takes the nearest marker to the pointer', () => {
    scene([
      ['jupiter', 400, 300, 0.5, -2.5],
      ['saturn', 410, 300, 0.5, 0.5],
    ]);
    expect(pickBody(402, 300)).toBe('jupiter');
    expect(pickBody(409, 300)).toBe('saturn');
  });

  it('prefers the brighter of two specks the pointer is about as near to', () => {
    // A faint moon 1 px nearer the pointer than its bright planet: the planet wins…
    scene([
      ['jupiter', 400, 300, 0.4, -2.5],
      ['moon', 406, 300, 0.1, 5],
    ]);
    expect(pickBody(403.5, 300)).toBe('jupiter');
    // …but a pointer clearly on the moon picks the moon.
    expect(pickBody(406, 300)).toBe('moon');
  });

  it('ignores bodies out of reach, behind the camera or absent', () => {
    scene([['mars', 400, 300, 0.5, 1]]);
    expect(pickBody(430, 300)).toBeNull();
    sim.bodies.mars.screen.inFront = false;
    expect(pickBody(400, 300)).toBeNull();
    scene([['voyager1', 400, 300, 0.1, 20]]);
    sim.bodies.voyager1.present = false;
    expect(pickBody(400, 300)).toBeNull();
  });

  it('breaks an exact tie by distance from the camera', () => {
    scene([
      ['uranus', 400, 300, 0.2, 5.7, 2.8e9],
      ['neptune', 400, 300, 0.2, 5.7, 4.3e9],
    ]);
    expect(pickBody(400, 300)).toBe('uranus');
  });
});

describe('pickBody, a faint marker right under the pointer', () => {
  it('beats a bright one a few pixels away (a spacecraft by its planet)', () => {
    scene([
      ['jupiter', 405, 300, 0.4, -2.5],
      ['voyager1', 400, 300, 0.001, 25],
    ]);
    expect(pickBody(400, 300)).toBe('voyager1');
    expect(pickBody(400.5, 300)).toBe('voyager1');
    // Pointing between them, nearer the planet: the planet.
    expect(pickBody(403, 300)).toBe('jupiter');
  });
});
