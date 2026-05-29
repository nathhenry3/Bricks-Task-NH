# Bricks Experiment Documentation

This documentation tracks current behavior in this repository.

## Getting Started

- [**User Guide**](./USER_GUIDE.md): Installation, running locally, creating configs, deploying to JATOS.

## Core References

- [**Core Framework API**](./CORE_API.md): Exhaustive reference for `@experiments/core` utilities.
- [**Configuration & Inheritance**](./CONFIGURATION_GUIDE.md): Deep dive into the merge system, runtime overrides, variable resolution, and instruction slots.
- [**EEG Workflow**](./EEG_WORKFLOW.md): Local EEG bridge, optional LSL, and optional LabRecorder remote control.

## Task

- [**Task: Bricks (Conveyor)**](./TASK_BRICKS.md): Conveyor belt task with dynamic difficulty, spotlight, and DRT.

## Shared Modules

- [**Module: Detection Response Task (DRT)**](./MODULE_DRT.md): Concurrent detection task (ISO-standard).
- [**Module: Stimulus Injector**](./MODULE_INJECTOR.md): Generic trial injection and block-plan modification.

## Reference

- [**Bricks Runtime Config Schema**](./bricks-runtime-config-schema.md): Detailed runtime-facing schema for Bricks conveyor internals.

## Common Usage

```
# Start dev server
npm run dev

# Run with a specific config
http://localhost:5173/?config=bricks/spotlight
http://localhost:5173/?config=bricks/default

# Add auto-responder for smoke-testing
http://localhost:5173/?config=bricks/default&auto=true

# Export planned stimulus list without running
http://localhost:5173/?config=bricks/default&exportStimuli=true
```
