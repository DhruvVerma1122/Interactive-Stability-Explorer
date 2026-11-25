/*
 * Interactive Stability Explorer — mathematical engine
 * Uses Math.js for parsing/compilation, but validates every AST node against
 * a strict arithmetic/function allow-list before compiling. No eval() is used.
 */
(function (global) {
  'use strict';

  const ALLOWED_SYMBOLS = new Set(['x', 'pi', 'e']);
  const ALLOWED_FUNCTIONS = new Set([
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
    'sinh', 'cosh', 'tanh', 'exp', 'log', 'ln', 'sqrt',
    'abs', 'sign', 'floor', 'ceil', 'min', 'max'
  ]);
  const ALLOWED_OPERATORS = new Set(['+', '-', '*', '/', '^', '%']);

  function validateAst(node) {
    if (!node || typeof node.type !== 'string') {
      throw new Error('The expression contains an unsupported syntax node.');
    }

    switch (node.type) {
      case 'ParenthesisNode':
        validateAst(node.content);
        return;
      case 'ConstantNode':
        if (typeof node.value !== 'number' || !Number.isFinite(node.value)) {
          throw new Error('Only finite numeric constants are allowed.');
        }
        return;
      case 'SymbolNode':
        if (!ALLOWED_SYMBOLS.has(node.name)) {
          throw new Error(`Unknown symbol "${node.name}". Use x, pi, or e.`);
        }
        return;
      case 'OperatorNode':
        if (!ALLOWED_OPERATORS.has(node.op)) {
          throw new Error(`Operator "${node.op}" is not supported.`);
        }
        if (node.args.length < 1 || node.args.length > 2) {
          throw new Error('Unsupported operator structure.');
        }
        node.args.forEach(validateAst);
        return;
      case 'FunctionNode': {
        if (!node.fn || node.fn.type !== 'SymbolNode' || !ALLOWED_FUNCTIONS.has(node.fn.name)) {
          throw new Error('Only approved mathematical functions are allowed.');
        }
        if (node.args.length < 1 || node.args.length > 2) {
          throw new Error(`Function "${node.fn.name}" has an unsupported number of arguments.`);
        }
        node.args.forEach(validateAst);
        return;
      }
      default:
        // This rejects assignments, accessors, arrays, objects, blocks,
        // conditionals, function definitions, and all other executable syntax.
        throw new Error(`Syntax type "${node.type}" is not allowed in a differential equation.`);
    }
  }


  function compileFallback(expression) {
    const tokens = [];
    let cursor = 0;
    while (cursor < expression.length) {
      const rest = expression.slice(cursor);
      const space = rest.match(/^\s+/);
      if (space) { cursor += space[0].length; continue; }
      const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
      if (number) { tokens.push({ type: 'number', value: Number(number[0]) }); cursor += number[0].length; continue; }
      const identifier = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (identifier) { tokens.push({ type: 'id', value: identifier[0] }); cursor += identifier[0].length; continue; }
      const ch = expression[cursor];
      if ('+-*/^%(),'.includes(ch)) { tokens.push({ type: ch, value: ch }); cursor++; continue; }
      throw new Error(`Unsupported character "${ch}" in expression.`);
    }
    let index = 0;
    const peek = () => tokens[index] || null;
    const take = () => tokens[index++] || null;
    const startsPrimary = (token) => token && (token.type === 'number' || token.type === 'id' || token.type === '(');

    function parsePrimary() {
      const token = take();
      if (!token) throw new Error('Unexpected end of expression.');
      if (token.type === '+') return { type: 'unary', op: '+', arg: parseExpression(25) };
      if (token.type === '-') return { type: 'unary', op: '-', arg: parseExpression(25) };
      if (token.type === 'number') return { type: 'number', value: token.value };
      if (token.type === '(') {
        const value = parseExpression(0);
        if (!peek() || take().type !== ')') throw new Error('Missing closing parenthesis.');
        return value;
      }
      if (token.type === 'id') {
        const name = token.value;
        if (ALLOWED_FUNCTIONS.has(name) && peek() && peek().type === '(') {
          take(); // opening parenthesis
          const args = [];
          if (peek() && peek().type !== ')') {
            args.push(parseExpression(0));
            while (peek() && peek().type === ',') { take(); args.push(parseExpression(0)); }
          }
          if (!peek() || take().type !== ')') throw new Error(`Missing closing parenthesis after ${name}.`);
          if (args.length < 1 || args.length > 2) throw new Error(`Function "${name}" needs one or two arguments.`);
          return { type: 'call', name, args };
        }
        if (!ALLOWED_SYMBOLS.has(name)) throw new Error(`Unknown symbol "${name}". Use x, pi, or e.`);
        return { type: 'symbol', name };
      }
      throw new Error(`Unexpected token "${token.value}".`);
    }

    function precedence(token) {
      if (!token) return -1;
      if (token.type === '+' || token.type === '-') return 10;
      if (token.type === '*' || token.type === '/' || token.type === '%') return 20;
      if (token.type === '^') return 30;
      if (startsPrimary(token)) return 20; // implicit multiplication, e.g. 2x or x(x-1)
      return -1;
    }

    function parseExpression(minPrecedence) {
      let left = parsePrimary();
      while (true) {
        const token = peek();
        const prec = precedence(token);
        if (prec < minPrecedence) break;
        let op;
        let implicit = false;
        if (startsPrimary(token)) { op = '*'; implicit = true; }
        else { op = take().type; }
        const right = parseExpression(op === '^' ? prec : prec + 1);
        left = { type: 'binary', op, left, right, implicit };
      }
      return left;
    }

    if (!tokens.length) throw new Error('Enter an expression for f(x).');
    const ast = parseExpression(0);
    if (index !== tokens.length) throw new Error(`Unexpected token "${peek().value}".`);

    const functions = {
      sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
      sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, log: Math.log, ln: Math.log,
      sqrt: Math.sqrt, abs: Math.abs, sign: Math.sign, floor: Math.floor, ceil: Math.ceil,
      min: Math.min, max: Math.max
    };
    function evaluate(node, x) {
      switch (node.type) {
        case 'number': return node.value;
        case 'symbol': return node.name === 'x' ? x : (node.name === 'pi' ? Math.PI : Math.E);
        case 'unary': { const v = evaluate(node.arg, x); return node.op === '-' ? -v : v; }
        case 'binary': {
          const a = evaluate(node.left, x), b = evaluate(node.right, x);
          if (node.op === '+') return a + b;
          if (node.op === '-') return a - b;
          if (node.op === '*') return a * b;
          if (node.op === '/') return a / b;
          if (node.op === '%') return a % b;
          if (node.op === '^') return Math.pow(a, b);
          return NaN;
        }
        case 'call': return functions[node.name](...node.args.map((arg) => evaluate(arg, x)));
        default: return NaN;
      }
    }
    return { ast, f: (x) => {
      try { const value = evaluate(ast, x); return typeof value === 'number' && Number.isFinite(value) ? value : NaN; }
      catch (_) { return NaN; }
    }};
  }

  function compileEquation(expression) {
    const cleaned = String(expression || '').trim().replace(/^\s*(?:dx\s*\/\s*dt|x\s*')\s*=\s*/i, '').replace(/\b(x|pi|e)\s*(?=\()/g, '$1*');
    if (!cleaned) throw new Error('Enter an expression for f(x), for example: x*(1-x).');
    if (cleaned.length > 180) throw new Error('Expression is too long (maximum 180 characters).');

    let ast;
    let fn;
    if (typeof global.math !== 'undefined') {
      try {
        ast = global.math.parse(cleaned);
      } catch (err) {
        throw new Error(`Could not parse the expression: ${err.message}`);
      }
      validateAst(ast);
      const compiled = ast.compile();
      fn = function (x) {
        if (!Number.isFinite(x)) return NaN;
        let value;
        try { value = compiled.evaluate({ x: x, pi: Math.PI, e: Math.E }); }
        catch (_) { return NaN; }
        return typeof value === 'number' && Number.isFinite(value) ? value : NaN;
      };
    } else {
      // Offline fallback: a small Pratt parser with the same restricted grammar.
      const fallback = compileFallback(cleaned);
      ast = fallback.ast;
      fn = fallback.f;
    }

    // Probe the function to catch common domain/evaluation problems early.
    const probes = [-5.9, -3, -1.234, -0.371, 0, 0.618, 1.417, 3, 5.5, 5.9, 6];
    if (!probes.some((p) => Number.isFinite(fn(p)))) {
      throw new Error('This expression does not produce finite real values at the test points.');
    }
    return { expression: cleaned, ast: ast, f: fn };
  }

  function derivative(f, x) {
    const h = 1e-5 * Math.max(1, Math.abs(x));
    const a = f(x - h);
    const b = f(x + h);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
    return (b - a) / (2 * h);
  }

  function bisect(f, a, b, fa, fb) {
    let left = a;
    let right = b;
    let fl = fa;
    for (let i = 0; i < 80; i++) {
      const mid = (left + right) / 2;
      const fm = f(mid);
      if (!Number.isFinite(fm)) return null;
      if (Math.abs(fm) < 1e-12 || Math.abs(right - left) < 1e-10) return mid;
      if (fl * fm <= 0) {
        right = mid;
      } else {
        left = mid;
        fl = fm;
      }
    }
    return (left + right) / 2;
  }

  function goldenMinimumAbs(f, a, b) {
    const ratio = (Math.sqrt(5) - 1) / 2;
    let c = b - ratio * (b - a);
    let d = a + ratio * (b - a);
    const score = (x) => {
      const y = f(x);
      return Number.isFinite(y) ? Math.abs(y) : Infinity;
    };
    let fc = score(c);
    let fd = score(d);
    for (let i = 0; i < 55; i++) {
      if (fc < fd) {
        b = d; d = c; fd = fc; c = b - ratio * (b - a); fc = score(c);
      } else {
        a = c; c = d; fc = fd; d = a + ratio * (b - a); fd = score(d);
      }
    }
    const x = (a + b) / 2;
    return { x: x, value: score(x) };
  }

  function findEquilibria(f, minX, maxX, segments) {
    const n = Math.max(300, Math.min(6000, segments || 2400));
    const step = (maxX - minX) / n;
    const xs = new Array(n + 1);
    const ys = new Array(n + 1);
    let maxAbs = 0;
    for (let i = 0; i <= n; i++) {
      xs[i] = minX + i * step;
      ys[i] = f(xs[i]);
      if (Number.isFinite(ys[i])) maxAbs = Math.max(maxAbs, Math.abs(ys[i]));
    }
    const finiteSamples = ys.filter(Number.isFinite);
    if (finiteSamples.length > n * 0.95 && finiteSamples.every((value) => value === 0)) {
      // f(x) is numerically zero throughout the interval: represent the
      // continuum of equilibria by one neutral sample, not thousands of roots.
      return [Math.max(minX, Math.min(maxX, 0))];
    }
    const zeroTolerance = Math.max(Number.MIN_VALUE, 1e-8 * maxAbs);
    const roots = [];

    for (let i = 0; i < n; i++) {
      const x1 = xs[i], x2 = xs[i + 1];
      const y1 = ys[i], y2 = ys[i + 1];
      if (!Number.isFinite(y1) || !Number.isFinite(y2)) continue;
      if (Math.abs(y1) <= zeroTolerance) roots.push(x1);
      if (y1 * y2 < 0) {
        const root = bisect(f, x1, x2, y1, y2);
        if (root !== null) roots.push(root);
      }
      if (i === n - 1 && Math.abs(y2) <= zeroTolerance) roots.push(x2);
    }

    // Search local minima of |f| as well as sign changes. This catches many
    // even-multiplicity equilibria such as f(x) = (x-a)^2.
    for (let i = 1; i < n; i++) {
      const y0 = ys[i - 1], y1 = ys[i], y2 = ys[i + 1];
      if (![y0, y1, y2].every(Number.isFinite)) continue;
      if (Math.abs(y1) <= Math.abs(y0) && Math.abs(y1) <= Math.abs(y2)) {
        const candidate = goldenMinimumAbs(f, xs[i - 1], xs[i + 1]);
        if (candidate.value <= zeroTolerance) roots.push(candidate.x);
      }
    }

    roots.sort((a, b) => a - b);
    const unique = [];
    for (const root of roots) {
      if (root < minX - step || root > maxX + step) continue;
      if (!unique.length || Math.abs(root - unique[unique.length - 1]) > 1e-4 * Math.max(1, Math.abs(root))) {
        unique.push(root);
      } else if (Math.abs(f(root)) < Math.abs(f(unique[unique.length - 1]))) {
        unique[unique.length - 1] = root;
      }
    }
    return unique;
  }

  function classifyEquilibrium(f, root, allRoots, index) {
    const d = derivative(f, root);
    const localScale = Math.max(Math.abs(f(root + 0.1)) || 0, Math.abs(f(root - 0.1)) || 0, Number.MIN_VALUE);
    const derivativeThreshold = 1e-6 * localScale;
    if (Number.isFinite(d) && d < -derivativeThreshold) {
      return { type: 'Asymptotically stable', key: 'asymptotically-stable', derivative: d,
        explanation: `f′(x*) ≈ ${formatNumber(d)} < 0, so nearby trajectories move toward this equilibrium.` };
    }
    if (Number.isFinite(d) && d > derivativeThreshold) {
      return { type: 'Unstable', key: 'unstable', derivative: d,
        explanation: `f′(x*) ≈ ${formatNumber(d)} > 0, so small disturbances move away from this equilibrium.` };
    }

    const leftGap = index > 0 ? root - allRoots[index - 1] : Infinity;
    const rightGap = index < allRoots.length - 1 ? allRoots[index + 1] - root : Infinity;
    const baseGap = Math.min(leftGap, rightGap, 1.5);
    const delta = Math.max(1e-4, Math.min(1e-2 * Math.max(1, Math.abs(root)), baseGap * 0.18));
    const leftValue = f(root - delta);
    const rightValue = f(root + delta);
    const eps = 1e-10 * Math.max(Math.abs(leftValue) || 0, Math.abs(rightValue) || 0, Number.MIN_VALUE);
    const leftSign = Number.isFinite(leftValue) && leftValue > eps ? 1 : (leftValue < -eps ? -1 : 0);
    const rightSign = Number.isFinite(rightValue) && rightValue > eps ? 1 : (rightValue < -eps ? -1 : 0);

    if (leftSign > 0 && rightSign < 0) {
      return { type: 'Asymptotically stable', key: 'asymptotically-stable', derivative: d,
        leftSign, rightSign,
        explanation: 'The flow points toward x* from both sides (→ x* ←), so nearby solutions approach it even though the derivative test is inconclusive.' };
    }
    if (leftSign < 0 && rightSign > 0) {
      return { type: 'Unstable', key: 'unstable', derivative: d,
        leftSign, rightSign,
        explanation: 'The flow points away from x* on both sides (← x* →), so nearby solutions move away.' };
    }
    if ((leftSign > 0 && rightSign > 0) || (leftSign < 0 && rightSign < 0)) {
      const attractingSide = leftSign > 0 ? 'left' : 'right';
      return { type: 'Semistable', key: 'semistable', derivative: d,
        leftSign, rightSign,
        explanation: `The flow approaches x* from the ${attractingSide} but moves away on the other side, so the equilibrium is semistable.` };
    }
    return { type: 'Stable', key: 'stable', derivative: d,
      leftSign, rightSign,
      explanation: 'The local sign test found no clear outward flow. The equilibrium is treated as stable (neutral) in this neighborhood; inspect the numerical phase line.' };
  }

  function analyze(expression, minX, maxX) {
    const compiled = compileEquation(expression);
    const roots = findEquilibria(compiled.f, minX, maxX);
    const equilibria = roots.map((root, index) => ({
      x: root,
      ...classifyEquilibrium(compiled.f, root, roots, index)
    }));
    return { expression: compiled.expression, ast: compiled.ast, f: compiled.f, equilibria, domain: [minX, maxX] };
  }

  function rk4Step(f, x, dt) {
    const k1 = f(x);
    const k2 = f(x + 0.5 * dt * k1);
    const k3 = f(x + 0.5 * dt * k2);
    const k4 = f(x + dt * k3);
    if (![k1, k2, k3, k4].every(Number.isFinite)) return NaN;
    return x + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
  }

  function integrateRK4(f, initial, duration, dt) {
    const steps = Math.max(1, Math.ceil(duration / dt));
    if (steps > 30000) throw new Error('The selected time and step size require too many integration steps. Increase the step size or reduce the duration.');
    const actualDt = duration / steps;
    const points = [{ t: 0, x: initial }];
    let x = initial;
    for (let i = 1; i <= steps; i++) {
      const next = rk4Step(f, x, actualDt);
      if (!Number.isFinite(next) || Math.abs(next) > 1e8) {
        points.push({ t: i * actualDt, x: null });
        return { points, actualDt, stopped: true, message: 'The numerical solution became non-finite or exceeded 10⁸. The trajectory was stopped.' };
      }
      x = next;
      points.push({ t: i * actualDt, x: x });
    }
    return { points, actualDt, stopped: false, message: '' };
  }

  function directionAt(f, x) {
    const v = f(x);
    if (!Number.isFinite(v)) return 0;
    return v > 0 ? 1 : (v < 0 ? -1 : 0);
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return '—';
    const p = digits === undefined ? 4 : digits;
    if (Math.abs(value) < 1e-10) return '0';
    if (Math.abs(value) >= 1e5 || Math.abs(value) < 1e-3) return value.toExponential(2);
    return Number(value.toFixed(p)).toString();
  }

  global.StabilityMath = {
    compileEquation,
    analyze,
    derivative,
    findEquilibria,
    integrateRK4,
    directionAt,
    formatNumber
  };
})(window);
