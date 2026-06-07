# Confidence interval method for the Mean CI column

This note records why the Mean CI column uses a Student `t_{n-1}` interval
around the mean gain, and why the distribution-free and bootstrap alternatives
were rejected. Reproduce with `npx tsx scripts/analyze-distributions.ts`.

## Question

The Mean CI reports `mean ± q · (s/√n)` for the per-race length gain. The
per-race gain is bounded, so it is never exactly normal, which means there is no
exact `t` interval available: every practical choice is asymptotic or
conservative. The question is which choice best fits this use (a descriptive
precision-of-the-mean stat, computed in the browser, shown next to a mean of
order 0.1 to 1 length, at the default n = 500).

## What the per-race gain distributions look like

Reference sample: 19,975 sims per applicable AG.json skill (Pace Chaser,
`<Mile>`, `<Random>` track, so each population is itself a mixture over 17
courses and 5 moods).

| skill | mean | sd | median | %zero | skew | exKurt |
| --- | --- | --- | --- | --- | --- | --- |
| Ignited Spirit SPD | 0.219 | 0.203 | 0.181 | 0.0 | +0.47 | 18.8 |
| Ramp Up | 0.178 | 0.161 | 0.179 | 0.1 | −2.16 | 31.9 |
| It's On! | 0.407 | 0.207 | 0.460 | 0.1 | −2.12 | 23.8 |
| Triumphant Pulse | 0.451 | 0.066 | 0.455 | 0.2 | −0.93 | 7.1 |
| Playtime's Over! | 0.315 | 0.185 | 0.322 | 1.0 | −1.36 | 25.7 |
| Homestretch Haste | 0.186 | 0.068 | 0.211 | 2.4 | −1.17 | 0.5 |
| Pace Chaser Straightaways ○ | 0.248 | 0.171 | 0.275 | 3.5 | −0.14 | 26.8 |
| Pace Chaser Straightaways ◎ | 0.410 | 0.235 | 0.455 | 3.7 | −0.79 | 15.2 |
| Straightaway Adept | 0.199 | 0.149 | 0.220 | 5.8 | −1.11 | 30.1 |
| Nimble Navigator | 0.914 | 0.855 | 0.732 | 5.9 | +1.07 | 1.0 |
| Head-On | 0.772 | 0.734 | 0.583 | 6.0 | +0.83 | 0.0 |
| Prideful King | 0.403 | 0.154 | 0.452 | 11.4 | −1.90 | 2.6 |
| Corner Adept ○ | 0.249 | 0.241 | 0.230 | 15.7 | +0.54 | 8.0 |
| Professor of Curvature | 0.556 | 0.479 | 0.594 | 15.7 | +1.29 | 3.7 |
| Right-Handed ◎ | 0.147 | 0.277 | 0.000 | 29.4 | −0.89 | 14.0 |
| Right-Handed ○ | 0.101 | 0.240 | 0.211 | 29.4 | −1.91 | 30.2 |
| Calm in a Crowd | 0.632 | 1.002 | 0.000 | 54.5 | +1.28 | 0.7 |
| Corner Recovery ○ | 0.640 | 1.026 | 0.000 | 55.9 | +1.34 | 0.9 |

The gains are bounded (roughly [−4, +7] length), zero-inflated (0% to 56% exact
zeros from the wisdom check and conditional applicability such as track
rotation), skewed (−2.2 to +1.3), often extremely leptokurtic (excess kurtosis
up to ~32), and frequently multimodal (a spike at 0 from non-triggering plus a
positive bump). The per-race distribution is about as non-normal as it gets.

## Coverage study

Monte-Carlo coverage at n = 500 (target 95%, 800 outer resamples, 600 inner
bootstrap replicates), treating each 20k sample as the population. Cells are
`coverage% / mean half-width`.

| skill (%zero, skew) | Wald-z | Hoeffding | Emp. Bernstein | Boot-pct | Boot-BCa |
| --- | --- | --- | --- | --- | --- |
| Ignited Spirit (0%, +0.5) | 95.5 / 0.018 | 100 / 0.329 | 100 / 0.138 | 95.1 / 0.018 | 94.5 / 0.018 |
| Nimble Navigator (6%, +1.1) | 95.6 / 0.075 | 100 / 0.313 | 100 / 0.219 | 95.1 / 0.075 | 95.4 / 0.075 |
| Professor of Curv. (16%, +1.3) | 94.0 / 0.042 | 100 / 0.367 | 100 / 0.188 | 94.0 / 0.042 | 93.1 / 0.042 |
| Corner Recovery (56%, +1.3) | 94.0 / 0.090 | 100 / 0.499 | 100 / 0.304 | 93.8 / 0.089 | 94.1 / 0.090 |

Findings:

- The CI is on the mean, not on the per-race gain, so the CLT applies. At
  n = 500 the Wald interval lands at 94.0% to 95.6% coverage even for the
  56%-zero, skew-1.3 skills. The grotesque per-race shape does not break the
  mean interval.
- Hoeffding and empirical Bernstein deliver their guarantee (100% coverage) at
  3x to 19x the Wald width. A half-width of 0.3 to 0.5 length on means of 0.2 to
  0.9 would swamp the signal and make most skills statistically
  indistinguishable in the table. They also need a known support `[a,b]` that we
  do not have a priori (the study fed them the population range; in-app only the
  per-run empirical range is available, which is smaller and silently breaks the
  guarantee).
- Bootstrap (percentile and BCa) matches Wald to three digits and is sometimes
  slightly worse (BCa 93.1% to 95.4%), at 600x the compute. At n = 500 the
  skew correction BCa exists to provide is already negligible.

## Decision: Student t_{n-1}

Keep the cheap parametric interval, but use the `t_{n-1}` quantile instead of
the normal `z`. Rationale:

- Among practical options it is the tightest with near-nominal coverage and
  O(1) compute, which is what a descriptive UI stat needs.
- The guaranteed-coverage methods cost 3x to 19x width to fix an undercoverage
  that is about 1 percentage point at n = 500.
- The bootstrap gives an identical answer for hundreds of times the work.
- `t` over `z` is the free, marginally more honest choice for small n: at
  n = 500 the two agree to ~0.2%, and `t` widens correctly when a config runs
  few simulations or when per-combination batching shrinks the effective n.

Implementation: `tForConfidenceLevel` / `studentTQuantile` in `utils.ts`, used
by `calculateStatsFromRawResults`. Small df use the exact t-beta identity
`df/(df+T²) ~ Beta(df/2, 1/2)`; df ≥ 50 (the production regime) use the
Cornish-Fisher expansion, which is exact to the eye there and avoids the slow
convergence of the incomplete-beta continued fraction as `x → 1`.

A negative Mean CI bound, if it ever appears, means the true mean is
statistically indistinguishable from zero. That is correct information and is
not clamped.
