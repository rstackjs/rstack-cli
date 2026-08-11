#![deny(clippy::all)]

use std::{borrow::Cow, collections::HashMap, path::Path, path::PathBuf};

use ignore::{
    gitignore::{Gitignore, GitignoreBuilder},
    Match,
};

/// Raw Gitignore patterns anchored to a base directory.
pub struct IgnoreSource {
    root_path: PathBuf,
    patterns: String,
}

impl IgnoreSource {
    /// Creates a pattern source whose rules are resolved from `root_path`.
    pub fn new(root_path: impl Into<PathBuf>, patterns: impl Into<String>) -> Self {
        Self {
            root_path: root_path.into(),
            patterns: patterns.into(),
        }
    }
}

/// A reusable matcher compiled from one or more independent pattern sources.
pub struct IgnoreMatcher {
    sources: Vec<SourceMatcher>,
}

impl IgnoreMatcher {
    /// Compiles every source while preserving source-level ignore isolation.
    pub fn new(sources: impl IntoIterator<Item = IgnoreSource>) -> Result<Self, ignore::Error> {
        let sources = sources
            .into_iter()
            .map(SourceMatcher::new)
            .collect::<Result<_, _>>()?;

        Ok(Self { sources })
    }

    /// Returns whether a file or directory is ignored by any source.
    pub fn is_ignored(&mut self, file_path: &Path, is_directory: bool) -> bool {
        // Sources are independent: a negation in one source cannot re-include a path ignored by
        // another source.
        self.sources
            .iter_mut()
            .any(|source| source.is_ignored(file_path, is_directory))
    }
}

struct SourceMatcher {
    root_path: PathBuf,
    matcher: Gitignore,
    // File checks repeatedly consult their parents, so cache both ignored and included directories.
    ignored_directories: HashMap<Box<str>, bool>,
}

impl SourceMatcher {
    fn new(source: IgnoreSource) -> Result<Self, ignore::Error> {
        // Paths are made relative to the source root before matching, so the builder uses a
        // synthetic root instead of tying compiled patterns to an absolute path.
        let mut builder = GitignoreBuilder::new(".");
        // Match the case-insensitive default used by the previous JavaScript matcher.
        builder.case_insensitive(true)?;

        // Accept ignore files with CRLF line endings or a UTF-8 byte-order mark.
        for line in source.patterns.split('\n') {
            let line = line.strip_suffix('\r').unwrap_or(line);
            let line = line.strip_prefix('\u{feff}').unwrap_or(line);
            // Gitignore files and the previous JavaScript matcher treat malformed lines as
            // nonmatching, while continuing to apply the remaining valid rules.
            let _ = builder.add_line(None, line);
        }

        Ok(Self {
            root_path: source.root_path,
            matcher: builder.build()?,
            ignored_directories: HashMap::new(),
        })
    }

    fn is_ignored(&mut self, file_path: &Path, is_directory: bool) -> bool {
        let relative_path = self.relative_path(file_path);
        if relative_path.as_os_str().is_empty() {
            return false;
        }

        let relative_path = to_posix_path(&relative_path);
        if is_directory {
            return self.is_directory_ignored(&relative_path);
        }

        // Gitignore cannot re-include a path below an ignored directory, so parent state wins.
        parent_directory(&relative_path).is_some_and(|parent| self.is_directory_ignored(parent))
            || is_ignore_match(self.matcher.matched(relative_path.as_ref(), false))
    }

    fn relative_path<'path>(&self, file_path: &'path Path) -> Cow<'path, Path> {
        if let Ok(relative_path) = file_path.strip_prefix(&self.root_path) {
            return Cow::Borrowed(relative_path);
        }

        // Patterns may intentionally target paths outside the source root with `../` segments.
        Cow::Owned(
            pathdiff::diff_paths(file_path, &self.root_path)
                .unwrap_or_else(|| file_path.to_path_buf()),
        )
    }

    fn is_directory_ignored(&mut self, relative_path: &str) -> bool {
        let relative_path = relative_path.trim_end_matches('/');
        if relative_path.is_empty() {
            return false;
        }

        if let Some(ignored) = self.ignored_directories.get(relative_path) {
            return *ignored;
        }

        let ignored = parent_directory(relative_path)
            .is_some_and(|parent| self.is_directory_ignored(parent))
            || is_ignore_match(self.matcher.matched(relative_path, true));
        self.ignored_directories
            .insert(relative_path.into(), ignored);
        ignored
    }
}

fn parent_directory(relative_path: &str) -> Option<&str> {
    let separator = relative_path.rfind('/')?;
    (separator > 0).then_some(&relative_path[..separator])
}

fn is_ignore_match(matched: Match<&ignore::gitignore::Glob>) -> bool {
    matches!(matched, Match::Ignore(_))
}

fn to_posix_path(path: &Path) -> Cow<'_, str> {
    let path = path.to_string_lossy();

    #[cfg(windows)]
    {
        Cow::Owned(path.replace('\\', "/"))
    }

    #[cfg(not(windows))]
    {
        path
    }
}
