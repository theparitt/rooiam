use utoipa::OpenApi;

fn main() {
    println!(
        "{}",
        rooiam_server_lib::openapi::ApiDoc::openapi()
            .to_pretty_json()
            .unwrap()
    );
}
