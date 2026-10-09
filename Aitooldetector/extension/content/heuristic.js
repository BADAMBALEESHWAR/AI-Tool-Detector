// AI Monitor — Content Script
// Structural fingerprinting for unknown AI tool detection
// Privacy: does NOT read message content, only detects UI patterns

(function () {
  'use strict';

  // Only run on pages not already matched by the service worker
  function hasChatUI() {
    // Look for chat-like UI patterns (text input + send button)
    const textInputs = document.querySelectorAll('textarea, input[type="text"]');
    const sendButtons = document.querySelectorAll(
      'button[type="submit"], button[aria-label*="send" i], button[aria-label*="submit" i], button[title*="send" i]'
    );

    if (textInputs.length > 0 && sendButtons.length > 0) {
      return true;
    }

    // Check for common chat container class names (structural, not content)
    const chatContainers = document.querySelectorAll(
      '[class*="chat"], [class*="conversation"], [class*="message-list"], [id*="chat"], [id*="conversation"]'
    );

    return chatContainers.length > 2; // Multiple chat elements suggests chat UI
  }

  function getPageInfo() {
    return {
      hostname: window.location.hostname.replace(/^www\./, ''),
      title: document.title.split(' - ')[0].trim(), // First part of title usually the page name
      hasChatUI: hasChatUI(),
    };
  }

  // Run after page is fully loaded
  function check() {
    const info = getPageInfo();

    if (info.hasChatUI) {
      // Send to service worker for evaluation
      chrome.runtime.sendMessage({
        type: 'HEURISTIC_MATCH',
        hostname: info.hostname,
        title: info.title,
        hasChatUI: info.hasChatUI,
      }).catch(() => {
        // Extension may have been updated — ignore
      });
    }
  }

  // Check on load
  if (document.readyState === 'complete') {
    check();
  } else {
    window.addEventListener('load', check, { once: true });
  }
})();
