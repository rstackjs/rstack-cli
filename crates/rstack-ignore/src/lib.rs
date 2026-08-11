#![deny(clippy::all)]

use std::{borrow::Cow, collections::HashMap, path::Path, path::PathBuf};

use ignore::{
    gitignore::{Gitignore, GitignoreBuilder},
    Match,
};

fn compile_patterns(patterns: &str) -> Result<Gitignore, ignore::Error> {
    // Paths are made relative to the source root before matching, so the builder uses a
    // synthetic root instead of tying compiled patterns to an absolute path.
    let mut builder = GitignoreBuilder::new(".");
    // Match the case-insensitive default used by the previous JavaScript matcher.
    builder.case_insensitive(true)?;

    // Accept ignore files with CRLF line endings or a UTF-8 byte-order mark.
    for line in patterns.split('\n') {
        let line = line.strip_suffix('\r').unwrap_or(line);
        let line = line.strip_prefix('\u{feff}').unwrap_or(line);
        // Gitignore files and the previous JavaScript matcher treat malformed lines as
        // nonmatching, while continuing to apply the remaining valid rules.
        let _ = builder.add_line(None, line);
    }

    builder.build()
}

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

/// A hierarchy of repository `.gitignore` files keyed by their root-relative directories.
#[derive(Default)]
pub struct GitIgnoreMatcher {
    matchers: HashMap<Box<str>, GitIgnoreSourceMatcher>,
    // Traversal checks every file's parent, so cache both ignored and included directories.
    ignored_directories: HashMap<Box<str>, bool>,
}

impl GitIgnoreMatcher {
    /// Creates an empty hierarchy. Sources can be added as traversal discovers them.
    pub fn new() -> Self {
        Self::default()
    }

    /// Adds or replaces the patterns rooted at a POSIX, repository-relative directory.
    ///
    /// Returns whether the hierarchy contains any effective rules after the update.
    pub fn add_source(
        &mut self,
        relative_root: &str,
        patterns: &str,
    ) -> Result<bool, ignore::Error> {
        let relative_root = normalize_relative_path(relative_root);
        let matcher = compile_patterns(patterns)?;

        self.invalidate_directory_cache(relative_root);
        if matcher.is_empty() {
            self.matchers.remove(relative_root);
        } else {
            self.matchers
                .insert(relative_root.into(), GitIgnoreSourceMatcher::new(matcher));
        }
        Ok(!self.matchers.is_empty())
    }

    /// Returns whether a repository-relative POSIX path is ignored by its applicable hierarchy.
    pub fn is_ignored(&mut self, relative_path: &str, is_directory: bool) -> bool {
        let relative_path = normalize_relative_path(relative_path);
        if relative_path.is_empty() || self.matchers.is_empty() {
            return false;
        }

        if is_directory {
            return self.is_directory_ignored(relative_path);
        }

        // Git cannot re-include a path below an ignored directory, so parent state wins.
        parent_directory(relative_path).is_some_and(|parent| self.is_directory_ignored(parent))
            || self.matches(relative_path, false)
    }

    /// Matches one directory's child names without crossing the native boundary per entry.
    pub fn is_ignored_batch(
        &mut self,
        relative_parent: &str,
        names: &[String],
        directory_flags: &[u8],
    ) -> Vec<u8> {
        let relative_parent = normalize_relative_path(relative_parent);
        let separator = usize::from(!relative_parent.is_empty());
        let name_capacity = names.iter().map(String::len).max().unwrap_or(0);
        let mut relative_path =
            String::with_capacity(relative_parent.len() + separator + name_capacity);
        let mut ignored = Vec::with_capacity(names.len());

        for (name, is_directory) in names.iter().zip(directory_flags) {
            relative_path.clear();
            if !relative_parent.is_empty() {
                relative_path.push_str(relative_parent);
                relative_path.push('/');
            }
            relative_path.push_str(name);
            ignored.push(u8::from(
                self.is_ignored(&relative_path, *is_directory != 0),
            ));
        }

        ignored
    }

    /// Matches one child without allocating an intermediate names array.
    pub fn is_ignored_child(
        &mut self,
        relative_parent: &str,
        name: &str,
        is_directory: bool,
    ) -> bool {
        let relative_parent = normalize_relative_path(relative_parent);
        if relative_parent.is_empty() {
            return self.is_ignored(name, is_directory);
        }

        let mut relative_path = String::with_capacity(relative_parent.len() + 1 + name.len());
        relative_path.push_str(relative_parent);
        relative_path.push('/');
        relative_path.push_str(name);
        self.is_ignored(&relative_path, is_directory)
    }

    /// Matches up to 32 child names and packs both input types and results into bit masks.
    pub fn is_ignored_batch_mask(
        &mut self,
        relative_parent: &str,
        names: &[String],
        directory_mask: u32,
    ) -> u32 {
        debug_assert!(names.len() <= u32::BITS as usize);

        let relative_parent = normalize_relative_path(relative_parent);
        let separator = usize::from(!relative_parent.is_empty());
        let name_capacity = names.iter().map(String::len).max().unwrap_or(0);
        let mut relative_path =
            String::with_capacity(relative_parent.len() + separator + name_capacity);
        let mut ignored_mask = 0;

        for (index, name) in names.iter().enumerate() {
            relative_path.clear();
            if !relative_parent.is_empty() {
                relative_path.push_str(relative_parent);
                relative_path.push('/');
            }
            relative_path.push_str(name);
            if self.is_ignored(&relative_path, directory_mask & (1 << index) != 0) {
                ignored_mask |= 1 << index;
            }
        }

        ignored_mask
    }

    fn invalidate_directory_cache(&mut self, relative_root: &str) {
        if relative_root.is_empty() {
            self.ignored_directories.clear();
            return;
        }

        let descendant_prefix = format!("{relative_root}/");
        self.ignored_directories
            .retain(|relative_path, _| !relative_path.starts_with(&descendant_prefix));
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
            || self.matches(relative_path, true);
        self.ignored_directories
            .insert(relative_path.into(), ignored);
        ignored
    }

    fn matches(&mut self, relative_path: &str, is_directory: bool) -> bool {
        // Most repositories only use a root `.gitignore`. Avoid looking up every path segment
        // when no nested matcher can override the root result.
        if self.matchers.len() == 1 {
            if let Some(root_matcher) = self.matchers.get_mut("") {
                return root_matcher
                    .match_path(relative_path, is_directory)
                    .unwrap_or(false);
            }
        }

        let mut ignored = false;
        let mut matcher_root_end = 0;
        let mut path_from_matcher_start = 0;

        for segment in relative_path.split('/') {
            let matcher_root = &relative_path[..matcher_root_end];
            if let Some(matcher) = self.matchers.get_mut(matcher_root) {
                let path_from_matcher = &relative_path[path_from_matcher_start..];
                if let Some(state) = matcher.match_path(path_from_matcher, is_directory) {
                    ignored = state;
                }
            }

            matcher_root_end = path_from_matcher_start + segment.len();
            path_from_matcher_start = (matcher_root_end + 1).min(relative_path.len());
        }

        ignored
    }
}

/// One `.gitignore` source with the directory state needed to reproduce
/// `ignore.test(path)` without re-walking ancestors for every file.
struct GitIgnoreSourceMatcher {
    matcher: Gitignore,
    directory_states: HashMap<Box<str>, Option<bool>>,
}

impl GitIgnoreSourceMatcher {
    fn new(matcher: Gitignore) -> Self {
        Self {
            matcher,
            directory_states: HashMap::new(),
        }
    }

    fn match_path(&mut self, relative_path: &str, is_directory: bool) -> Option<bool> {
        if is_directory {
            return self.match_directory(relative_path);
        }

        match self.matcher.matched(relative_path, false) {
            Match::Ignore(_) => Some(true),
            Match::Whitelist(_) => Some(false),
            Match::None => parent_directory(relative_path)
                .is_some_and(|parent| self.is_directory_ignored(parent))
                .then_some(true),
        }
    }

    fn match_directory(&mut self, relative_path: &str) -> Option<bool> {
        if let Some(state) = self.directory_states.get(relative_path) {
            return *state;
        }

        let matched = self.matcher.matched(relative_path, true);
        let state = match matched {
            Match::Ignore(_) => Some(true),
            Match::Whitelist(_) => Some(false),
            Match::None => parent_directory(relative_path)
                .is_some_and(|parent| self.is_directory_ignored(parent))
                .then_some(true),
        };
        self.directory_states.insert(relative_path.into(), state);
        state
    }

    fn is_directory_ignored(&mut self, relative_path: &str) -> bool {
        self.match_directory(relative_path) == Some(true)
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
        Ok(Self {
            root_path: source.root_path,
            matcher: compile_patterns(&source.patterns)?,
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

fn normalize_relative_path(path: &str) -> &str {
    let path = path.trim_matches('/');
    if path == "." {
        ""
    } else {
        path.strip_prefix("./").unwrap_or(path)
    }
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

#[cfg(test)]
mod tests {
    use super::{GitIgnoreMatcher, IgnoreMatcher, IgnoreSource};
    use std::path::Path;

    #[test]
    fn keeps_independent_ignore_sources_isolated() {
        let mut matcher = IgnoreMatcher::new([
            IgnoreSource::new("project", "*.js\n!keep.js"),
            IgnoreSource::new("project", "keep.js"),
        ])
        .unwrap();

        assert!(matcher.is_ignored(Path::new("project/keep.js"), false));
        assert!(matcher.is_ignored(Path::new("project/drop.js"), false));
        assert!(!matcher.is_ignored(Path::new("project/keep.ts"), false));
    }

    #[test]
    fn applies_nested_sources_and_child_negation() {
        let mut matcher = GitIgnoreMatcher::new();
        matcher.add_source("", "*.js\ndist/\n").unwrap();
        matcher.add_source("src", "!keep.js\n").unwrap();
        matcher.add_source("dist", "!keep.js\n").unwrap();

        assert!(!matcher.is_ignored("src/keep.js", false));
        assert!(matcher.is_ignored("src/drop.js", false));
        assert!(matcher.is_ignored("dist", true));
        assert!(matcher.is_ignored("dist/keep.js", false));
        assert!(!matcher.is_ignored("visible.ts", false));
    }

    #[test]
    fn does_not_propagate_an_ancestor_unignore_across_sources() {
        let mut matcher = GitIgnoreMatcher::new();
        matcher.add_source("", "debug/\n").unwrap();
        matcher.add_source("scripts", "!debug\n").unwrap();

        assert!(!matcher.is_ignored("scripts/debug", true));
        assert!(matcher.is_ignored("scripts/debug/launch.mjs", false));
    }

    #[test]
    fn applies_a_nested_source_without_root_rules() {
        let mut matcher = GitIgnoreMatcher::new();
        matcher.add_source("src", "*.js\n").unwrap();

        assert!(!matcher.is_ignored("root.js", false));
        assert!(matcher.is_ignored("src/drop.js", false));
        assert!(!matcher.is_ignored("src/keep.ts", false));
    }

    #[test]
    fn preserves_valid_rules_around_malformed_and_normalized_lines() {
        let mut matcher = GitIgnoreMatcher::new();
        matcher
            .add_source("", "\u{feff}ignored.js\r\nmalformed\\\n*.snap\n")
            .unwrap();

        assert!(matcher.is_ignored("IGNORED.JS", false));
        assert!(matcher.is_ignored("nested/value.snap", false));
        assert!(!matcher.is_ignored("nested/value.ts", false));
    }

    #[test]
    fn invalidates_descendant_directory_cache_when_adding_a_source() {
        let mut matcher = GitIgnoreMatcher::new();
        matcher.add_source("", "generated/keep/**\n").unwrap();

        assert!(matcher.is_ignored("generated/keep/nested", true));
        matcher.add_source("generated/keep", "!nested/\n").unwrap();

        assert!(!matcher.is_ignored("generated/keep/nested", true));
    }

    #[test]
    fn matches_batches_in_input_order() {
        let mut matcher = GitIgnoreMatcher::new();
        matcher.add_source("", "*.js\ndist/\n").unwrap();
        let names = vec!["index.js".into(), "index.ts".into(), "dist".into()];

        assert_eq!(
            matcher.is_ignored_batch("nested", &names, &[0, 0, 1]),
            vec![1, 0, 1]
        );
        assert_eq!(
            matcher.is_ignored_batch_mask("nested", &names, 0b100),
            0b101
        );
        assert!(matcher.is_ignored_child("nested", "index.js", false));
    }

    #[test]
    fn omits_empty_sources() {
        let mut matcher = GitIgnoreMatcher::new();

        assert!(!matcher.add_source("", "# comment only\n").unwrap());
        assert!(!matcher.is_ignored("index.js", false));
    }
}
