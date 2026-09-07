use napi::{bindgen_prelude::Buffer, Error, Status};
use napi_derive::napi;
use swc_next_bridge::{parse_to_buffer, CommentMode, Lang, ParserOptions, SourceType};

/// Returns the SWC Next 0.2.0 wire format consumed by @swc-next/decoder.
/// Keep parsing and serialization in the upstream crate, not in the NAPI adapter.
#[napi]
pub fn parse_swc_next(source: String, lang: String, source_type: String) -> napi::Result<Buffer> {
    let lang = match lang.as_str() {
        "js" => Lang::Js,
        "jsx" => Lang::Jsx,
        "ts" => Lang::Ts,
        "tsx" => Lang::Tsx,
        "dts" => Lang::Dts,
        _ => {
            return Err(Error::new(
                Status::InvalidArg,
                "Unsupported SWC Next language.",
            ))
        }
    };
    let source_type = match source_type.as_str() {
        "module" => SourceType::Module,
        "commonjs" => SourceType::CommonJs,
        _ => {
            return Err(Error::new(
                Status::InvalidArg,
                "Unsupported SWC Next source type.",
            ))
        }
    };

    Ok(parse_to_buffer(
        &source,
        Some(ParserOptions {
            lang: Some(lang),
            source_type: Some(source_type),
            preserve_parens: Some(true),
            comments: Some(CommentMode::Flat),
        }),
    )
    .into())
}
