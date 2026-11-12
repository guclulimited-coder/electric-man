import SwiftUI
import AppTrackingTransparency

@main struct ElectricManApp: App {
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            GameView()
                .ignoresSafeArea(.container, edges: .bottom)
                .background(Color(red: 0.43, green: 0.78, blue: 1.0).ignoresSafeArea())
                .preferredColorScheme(.light)
        }
        // Apple 2.1: izleme izni oyun açılınca bir kez sorulur (eskiden yalnız ilk reklamdan hemen önce soruluyordu, inceleme bulamadı).
        .onChange(of: phase) { p in
            guard p == .active, ATTrackingManager.trackingAuthorizationStatus == .notDetermined else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { ATTrackingManager.requestTrackingAuthorization { _ in } }
        }
    }
}
