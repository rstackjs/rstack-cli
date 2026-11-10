// Rstack does not fall back to native tool config files. This file must never
// be loaded for a project.
throw new Error('rstest.config.ts must not be loaded by Rstack');
