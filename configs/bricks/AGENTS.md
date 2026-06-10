# AGENTS.md — Bricks configs

## Henry1 test variants

The `Henry1_test_*.json` files are manual pre-launch testing slices of `Henry1.json`.

When changing `configs/bricks/Henry1.json`, check whether the same change should be reflected in each relevant `Henry1_test_*.json` file. These test variants intentionally copy Henry1 runtime settings while reducing the `blocks`, `trials`, intro/end insertions, redirect behavior, or repeat loops for faster manual testing.

Keep test variants clearly marked with a top-level `testVariant` object and do not use them as production/JATOS launch configs.
