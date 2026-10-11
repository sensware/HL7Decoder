import SwiftUI
import WebKit

// Help › HL7 Decoder Help. Shows Help/index.html from the app bundle, which tools/build_help.js
// generates from docs/user-guide.md, in a window of its own.

/// Replaces the Help menu's default item (which only says help isn't available) with one that opens the help window.
struct HelpCommands: Commands {
  @Environment(\.openWindow) private var openWindow

  var body: some Commands {
    CommandGroup(replacing: .help) {
      Button("HL7 Decoder Help") { openWindow(id: HelpWindow.id) }
        .keyboardShortcut("?", modifiers: .command)
    }
  }
}

struct HelpWindow: View {
  static let id = "help"

  var body: some View {
    if let page = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Help") {
      HelpWebView(page: page)
    } else {
      Text("The help page is missing from this build.")
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }
}

/// A web view on the bundled help page. Links within the page scroll it; links elsewhere open in the browser.
struct HelpWebView: NSViewRepresentable {
  let page: URL

  func makeCoordinator() -> Coordinator { Coordinator() }

  func makeNSView(context: Context) -> WKWebView {
    let webView = WKWebView()
    webView.navigationDelegate = context.coordinator
    webView.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
    return webView
  }

  func updateNSView(_ nsView: WKWebView, context: Context) {}

  final class Coordinator: NSObject, WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
      if action.navigationType == .linkActivated, let url = action.request.url, !url.isFileURL {
        NSWorkspace.shared.open(url)
        decisionHandler(.cancel)
      } else {
        decisionHandler(.allow)
      }
    }
  }
}
