// This file must not be collected: the package config's `include` only matches
// `entry.ts`, so importing it means the project config was not applied.
throw new Error('pkg-a include was not applied');
