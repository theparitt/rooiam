// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "RooiamPhoneSDK",
    platforms: [.iOS(.v16)],
    products: [.library(name: "RooiamPhoneSDK", targets: ["RooiamPhoneSDK"])],
    targets: [
        .target(name: "RooiamPhoneSDK"),
        .testTarget(name: "RooiamPhoneSDKTests", dependencies: ["RooiamPhoneSDK"]),
    ]
)
