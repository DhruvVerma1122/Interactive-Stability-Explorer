/* Run with: node tests/math-engine-smoke-test.js */
global.window = global;
require('../math-engine.js');

const checks = [
  { expression: '-2*x', expected: [[0, 'Asymptotically stable']] },
  { expression: '2*x', expected: [[0, 'Unstable']] },
  { expression: 'x*(1-x)', expected: [[0, 'Unstable'], [1, 'Asymptotically stable']] },
  { expression: 'x^2-1', expected: [[-1, 'Asymptotically stable'], [1, 'Unstable']] },
  { expression: 'x*(x-1)*(x+1)', expected: [[-1, 'Unstable'], [0, 'Asymptotically stable'], [1, 'Unstable']] },
  { expression: '(x-0.5)^2', expected: [[0.5, 'Semistable']] },
  { expression: '-1e-12*x', expected: [[0, 'Asymptotically stable']] }
];

let failures = 0;
for (const test of checks) {
  const result = StabilityMath.analyze(test.expression, -6, 6);
  for (const [root, classification] of test.expected) {
    const found = result.equilibria.find((item) => Math.abs(item.x - root) < 1e-3);
    const pass = found && found.type === classification;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${test.expression}  x*=${root}  expected ${classification}${found ? `, received ${found.type}` : ', root not found'}`);
    if (!pass) failures++;
  }
}

const rk4 = StabilityMath.integrateRK4(StabilityMath.compileEquation('-2*x').f, 2, 1, 0.01);
const expectedAtOne = 2 * Math.exp(-2);
const rk4Pass = Math.abs(rk4.points[rk4.points.length - 1].x - expectedAtOne) < 1e-7;
console.log(`${rk4Pass ? 'PASS' : 'FAIL'}  RK4 accuracy for x'=-2x at t=1`);
if (!rk4Pass) failures++;

let unsafeBlocked = false;
try { StabilityMath.compileEquation('x; alert(1)'); } catch (_) { unsafeBlocked = true; }
console.log(`${unsafeBlocked ? 'PASS' : 'FAIL'}  unsafe statement rejected`);
if (!unsafeBlocked) failures++;

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('\nAll mathematical smoke tests passed.');
}
