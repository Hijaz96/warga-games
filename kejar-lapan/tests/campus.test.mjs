import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campusAt, CAMPUS_AREAS } from '../js/campus.js';
import { LANDMARKS, OBSTACLES } from '../js/config.js';
import { checkpointAt, landmarkFor, pattern, passable, createCourse, extendCourse } from '../js/course.js';
import { sceneryGeometry } from '../js/models.js';
import { mulberry32 } from '../../shared/rng.js';

test('areas follow the approached landmark at checkpoint boundaries, including repeated campus loops', () => {
  assert.equal(campusAt(0).landmark, LANDMARKS[1]);
  const seen = new Set();
  for (let k = 0; k < 100; k++) {
    const at = checkpointAt(k);
    assert.equal(campusAt(at - 0.01).landmark, landmarkFor(k));
    assert.equal(campusAt(at).landmark, landmarkFor(k + 1));
    assert.equal(campusAt(at + 0.01).landmark, landmarkFor(k + 1));
    assert.ok(campusAt(at).label);
    seen.add(campusAt(at).id);
  }
  assert.equal(seen.size, Object.keys(CAMPUS_AREAS).length);
});

test('every area keeps readable, passable rows at all difficulty tiers', () => {
  for (const [id, area] of Object.entries(CAMPUS_AREAS)) {
    const rng = mulberry32(42);
    for (let tier = 0; tier < 4; tier++) {
      for (let i = 0; i < 1000; i++) {
        const row = pattern(rng, tier, area);
        assert.ok(row.some(passable), `${id}/${tier}`);
        if (!tier) assert.ok(row.filter(Boolean).length <= 2);
        for (const type of row.filter(Boolean)) {
          assert.ok(OBSTACLES[type]);
          assert.ok(type === 'barrier' || area.jumpers.includes(type) || area.blockers.includes(type));
        }
      }
    }
  }
});

test('area patterns change the mix of obstacles rather than only scenery', () => {
  const mix = (id) => {
    const rng = mulberry32(17);
    const counts = {};
    for (let i = 0; i < 2000; i++) {
      for (const type of pattern(rng, 2, CAMPUS_AREAS[id]).filter(Boolean)) counts[type] = (counts[type] ?? 0) + 1;
    }
    return counts;
  };
  assert.ok(mix('college').monkey > 500);
  assert.equal(mix('engineering').monkey, undefined);
  assert.ok(mix('engineering').pothole > 500);
  assert.equal(mix('mosque').bus, undefined);
  assert.ok(mix('library').barrier > mix('college').barrier * 2);
});

test('area generation remains identical when the course is extended in small chunks', () => {
  const once = createCourse(72);
  const chunks = createCourse(72);
  extendCourse(once, 24000);
  for (let d = 100; d <= 24000; d += 100) extendCourse(chunks, d);
  assert.deepEqual(chunks.obstacles, once.obstacles);
  assert.deepEqual(chunks.items, once.items);
});

test('every area has distinct finite roadside geometry', () => {
  const signatures = new Set();
  for (const id of Object.keys(CAMPUS_AREAS)) {
    const geometry = sceneryGeometry(mulberry32(42), id);
    const positions = Array.from(geometry.attributes.position.array);
    assert.ok(positions.every(Number.isFinite), id);
    signatures.add(JSON.stringify(positions));
    geometry.dispose();
  }
  assert.equal(signatures.size, Object.keys(CAMPUS_AREAS).length);
});
