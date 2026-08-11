#![deny(clippy::all)]

use std::path::Path;

use napi::{bindgen_prelude::Uint8Array, Error, Status};
use napi_derive::napi;
use rstack_ignore::{
    GitIgnoreMatcher as CoreGitIgnoreMatcher, IgnoreMatcher as CoreIgnoreMatcher,
    IgnoreSource as CoreIgnoreSource,
};

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

/// JavaScript-facing hierarchy for repository `.gitignore` files.
#[napi]
pub struct GitIgnoreMatcher {
    inner: CoreGitIgnoreMatcher,
}

impl Default for GitIgnoreMatcher {
    fn default() -> Self {
        Self {
            inner: CoreGitIgnoreMatcher::new(),
        }
    }
}

#[napi]
impl GitIgnoreMatcher {
    /// Creates an empty matcher whose sources can be added during directory traversal.
    #[napi(constructor)]
    pub fn new() -> Self {
        Self::default()
    }

    /// Compiles or replaces rules rooted at a repository-relative POSIX directory.
    #[napi]
    pub fn add_source(&mut self, relative_root: String, patterns: String) -> napi::Result<bool> {
        self.inner
            .add_source(&relative_root, &patterns)
            .map_err(|error| {
                Error::from_reason(format!("Failed to compile .gitignore patterns: {error}"))
            })
    }

    /// Returns whether one repository-relative POSIX path is ignored.
    #[napi]
    pub fn is_ignored(&mut self, relative_path: String, is_directory: bool) -> bool {
        self.inner.is_ignored(&relative_path, is_directory)
    }

    /// Matches one directory's entries in a native call and returns one byte per name.
    #[napi]
    pub fn is_ignored_batch(
        &mut self,
        relative_parent: String,
        names: Vec<String>,
        directory_flags: Uint8Array,
    ) -> napi::Result<Uint8Array> {
        if names.len() != directory_flags.len() {
            return Err(Error::new(
                Status::InvalidArg,
                "Name and directory flag counts must match.",
            ));
        }

        Ok(self
            .inner
            .is_ignored_batch(&relative_parent, &names, directory_flags.as_ref())
            .into())
    }

    /// Matches up to 32 entries while avoiding per-directory typed-array allocation.
    #[napi]
    pub fn is_ignored_batch_mask(
        &mut self,
        relative_parent: String,
        names: Vec<String>,
        directory_mask: u32,
    ) -> napi::Result<u32> {
        if names.len() > u32::BITS as usize {
            return Err(Error::new(
                Status::InvalidArg,
                "A bit-mask batch cannot contain more than 32 names.",
            ));
        }

        Ok(self
            .inner
            .is_ignored_batch_mask(&relative_parent, &names, directory_mask))
    }

    /// Matches a single directory entry without constructing a JavaScript array.
    #[napi]
    pub fn is_ignored_child(
        &mut self,
        relative_parent: String,
        name: String,
        is_directory: bool,
    ) -> bool {
        self.inner
            .is_ignored_child(&relative_parent, &name, is_directory)
    }
}
