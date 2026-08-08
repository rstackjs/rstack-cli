#![deny(clippy::all)]

use napi_derive::napi;

#[napi]
pub fn native_ping(input: String) -> String {
    format!("pong:{input}")
}

#[cfg(test)]
mod tests {
    use super::native_ping;

    #[test]
    fn formats_ping_response() {
        assert_eq!(native_ping("rstack".to_string()), "pong:rstack");
    }
}
