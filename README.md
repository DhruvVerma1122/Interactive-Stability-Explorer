# Interactive Stability Explorer

A browser-based educational lab for the stability analysis of autonomous first-order differential equations

\[
\frac{dx}{dt}=f(x).
\]

The application is client-side: it does not require a backend, database, API key, build step, or package installation.

## Run the project

1. Download and extract `interactive-stability-explorer.zip`.
2. Open the `interactive-stability-explorer` folder.
3. Double-click `index.html` (or open it in a modern browser).

The project can also be served from any static file server. For example, from the project folder run:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

Math.js and Chart.js are loaded asynchronously from pinned CDN URLs when available. A restricted expression parser and a built-in Canvas chart renderer are included as fallbacks, so the core calculations and visualizations still work when the CDN cannot be reached. No user equation is sent to a server.

## Project structure

| File | Responsibility |
|---|---|
| `index.html` | Page structure, controls, chart containers, learning content, and documentation sections |
| `styles.css` | Responsive dark scientific dashboard styling |
| `math-engine.js` | Expression validation, equilibrium search, stability classification, numerical differentiation, and RK4 integration |
| `app.js` | User interactions, simulation playback, SVG diagrams, chart updates, comparison mode, and educational explanations |

The mathematical engine is deliberately separate from the UI layer. `app.js` calls the public `StabilityMath` methods exposed by `math-engine.js`.

## Included example systems

| Model | Equation | Equilibria | Expected local behavior |
|---|---|---|---|
| Stable linear | `dx/dt = -2*x` | `x* = 0` | Asymptotically stable; all nonzero trajectories decay toward zero |
| Unstable linear | `dx/dt = 2*x` | `x* = 0` | Unstable; nonzero trajectories move away from zero |
| Logistic nonlinear | `dx/dt = x*(1-x)` | `x* = 0, 1` | Zero is unstable; one is asymptotically stable. Positive initial states approach one |
| Two equilibria | `dx/dt = x^2-1` | `x* = -1, 1` | Minus one is asymptotically stable; plus one is unstable |
| Three equilibria | `dx/dt = x*(x-1)*(x+1)` | `x* = -1, 0, 1` | The origin is asymptotically stable; minus one and plus one are unstable |

## Controls

- **Predefined equations:** load one of the five examples.
- **Custom equation:** type `f(x)` and press Enter or the apply button. Supported arithmetic includes `+`, `-`, `*`, `/`, `%`, `^`, parentheses, and implicit multiplication such as `2x` or `x(x-1)`.
- **Functions:** `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sinh`, `cosh`, `tanh`, `exp`, `log`, `ln`, `sqrt`, `abs`, `sign`, `floor`, `ceil`, `min`, and `max`. The constants `pi` and `e` are supported.
- **Initial condition:** adjust `x(0)` using the slider.
- **Simulation time:** choose the final time `T`.
- **Integration step:** select the RK4 step size `Δt`.
- **Playback:** Start, Pause, Resume, and Reset the animated trajectory.
- **Compare:** compare two predefined systems from the same initial condition, time horizon, and step size.
- **Educational mode:** reveal the four-step derivation for the first detected equilibrium.

## Mathematical methods

### Equilibrium points

An equilibrium is a value `x*` satisfying

\[
f(x^*)=0.
\]

The engine searches the finite interval `[-6, 6]`. It samples `f(x)` on a grid, refines sign-changing intervals using bisection, and checks local minima of `|f(x)|` to catch many even-multiplicity roots that do not change sign. Nearby detections are merged to avoid reporting the same root repeatedly.

### Stability classification

For an isolated, differentiable equilibrium, the engine estimates the derivative with a central difference:

\[
f'(x^*)\approx\frac{f(x^*+h)-f(x^*-h)}{2h}.
\]

- If `f'(x*) < 0`, the equilibrium is **asymptotically stable**.
- If `f'(x*) > 0`, it is **unstable**.
- If the derivative is numerically close to zero, the engine samples `f(x)` on both sides:
  - `f(left) > 0` and `f(right) < 0`: flow points inward, so it is asymptotically stable.
  - `f(left) < 0` and `f(right) > 0`: flow points outward, so it is unstable.
  - equal nonzero signs: one-sided attraction and one-sided repulsion, so it is semistable.
  - both sides numerically zero: reported as stable/neutral in the local sample.

This is a numerical educational aid, not a symbolic proof system. In particular, the derivative test is inconclusive when the derivative is zero; a sign analysis or a more careful mathematical argument is required.

### Fourth-order Runge–Kutta (RK4)

The numerical solver advances the state using

\[
\begin{aligned}
k_1 &= f(x_n),\\
k_2 &= f\left(x_n+\frac{\Delta t}{2}k_1\right),\\
k_3 &= f\left(x_n+\frac{\Delta t}{2}k_2\right),\\
k_4 &= f(x_n+\Delta t\,k_3),\\
x_{n+1} &= x_n+\frac{\Delta t}{6}(k_1+2k_2+2k_3+k_4).
\end{aligned}
\]

The app precomputes the trajectory for the requested time horizon and then animates the stored points. The step size controls numerical resolution; animation speed is independent of the mathematical time step.

## Safe custom-expression handling

When Math.js is available, the project parses the expression into an abstract syntax tree and permits only numeric constants, `x`, `pi`, `e`, arithmetic operators, parentheses, and the listed mathematical functions. Assignments, property access, object and array literals, statements, and unapproved symbols/functions are rejected before compilation.

When Math.js is unavailable, a small Pratt parser implements the same restricted expression grammar. Neither parser uses JavaScript `eval()` or `Function()`.

## Visualizations

- **Solution curve:** `x(t)` plotted against time, including the initial condition, a moving current-state point, and horizontal equilibrium reference lines.
- **Phase line:** a vertical state axis. Upward arrows mean `f(x) > 0` and downward arrows mean `f(x) < 0`. Equilibrium markers are color-coded by stability.
- **Direction field:** arrows on the state axis point in the sign direction of `f(x)`; arrow length is scaled to the sampled magnitude. Equilibria and the current state are highlighted.
- **Comparison curve:** two trajectories are plotted together from the same initial state.

## Limitations and interpretation

1. Root detection is numerical and limited to `[-6, 6]`. Very close roots, highly oscillatory expressions, roots near singularities, and difficult repeated roots can be missed or approximated inaccurately.
2. The local stability test samples a small neighborhood. Results near singularities, discontinuities, non-isolated equilibria, or roots with extremely flat behavior need independent mathematical verification.
3. RK4 is explicit. Large time steps, stiff dynamics, or rapidly growing solutions can reduce accuracy. If a trajectory becomes non-finite or exceeds the safety bound `10^8`, the solver stops it rather than continuing with invalid values.
4. The project handles scalar autonomous continuous-time equations `dx/dt=f(x)`. It does not analyze coupled systems, explicit time dependence, or discrete-time models.
5. Browser rendering and numerical root finding are intended for undergraduate education and presentation. For formal work, compare numerical output with analytical derivations and convergence checks.

## Suggested presentation flow

1. Introduce the model `dx/dt=f(x)` and explain what the state variable represents.
2. Load `dx/dt=-2x`, start with `x(0)=2`, and show the trajectory approaching zero.
3. Switch to `dx/dt=2x` to contrast a repelling equilibrium.
4. Load the logistic equation and identify its two equilibrium points and different stability types.
5. Use the phase line to explain the sign of `f(x)` on each interval.
6. Demonstrate a repeated-root custom model such as `(x-0.5)^2` to show why the derivative test can be inconclusive and why sign analysis matters.
7. Use comparison mode to contrast two models from the same initial state.

---

**Project:** Interactive Stability Explorer  
**Topic:** Analysis of Stability in First-Order Differential Equations  
**Level:** Undergraduate Engineering Mathematics / Mathematics & Computing
