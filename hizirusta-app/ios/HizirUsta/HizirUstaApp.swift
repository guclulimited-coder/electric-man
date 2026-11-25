import SwiftUI
import AppTrackingTransparency

@main struct HizirUstaApp: App {
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            AppView()
                .ignoresSafeArea(.container, edges: .bottom)
                .background(Color(red: 0.08, green: 0.13, blue: 0.24).ignoresSafeArea())
        }
        // Apple 2.1: izleme izni uygulama açılınca bir kez sorulur
        .onChange(of: phase) { p in
            guard p == .active, ATTrackingManager.trackingAuthorizationStatus == .notDetermined else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { ATTrackingManager.requestTrackingAuthorization { _ in } }
        }
    }
}
