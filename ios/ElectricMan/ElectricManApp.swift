import SwiftUI

@main struct ElectricManApp: App {
    var body: some Scene {
        WindowGroup {
            GameView()
                .ignoresSafeArea(.container, edges: .bottom)
                .background(Color(red: 0.43, green: 0.78, blue: 1.0).ignoresSafeArea())
                .preferredColorScheme(.light)
        }
    }
}
