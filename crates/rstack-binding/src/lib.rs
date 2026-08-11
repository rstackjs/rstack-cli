#![deny(clippy::all)]

use std::path::Path;

use napi::Error;
use napi_derive::napi;
use rstack_ignore::{IgnoreMatcher as CoreIgnoreMatcher, IgnoreSource as CoreIgnoreSource};

/// A Gitignore-compatible pattern source received from JavaScript.
#[napi(object, object_to_js = false)]
pub struct IgnoreSource {
    /// Directory that patterns are resolved from.
    pub root_path: String,
    /// Newline-delimited Gitignore patterns.
    pub patterns: String,
}

/// JavaScript-facing wrapper around the compiled Rust matcher.
#[napi]
pub struct IgnoreMatcher {
    inner: CoreIgnoreMatcher,
}

#[napi]
impl IgnoreMatcher {
    /// Compiles all pattern sources once and keeps the result for repeated path checks.
    #[napi(constructor)]
    pub fn new(sources: Vec<IgnoreSource>) -> napi::Result<Self> {
        let sources = sources
            .into_iter()
            .map(|source| CoreIgnoreSource::new(source.root_path, source.patterns));
        let inner = CoreIgnoreMatcher::new(sources).map_err(|error| {
            Error::from_reason(format!("Failed to compile ignore patterns: {error}"))
        })?;

        Ok(Self { inner })
    }

    /// Returns whether a file or directory is ignored by any source.
    #[napi]
    pub fn is_ignored(&mut self, file_path: String, is_directory: bool) -> bool {
        self.inner.is_ignored(Path::new(&file_path), is_directory)
    }
}
