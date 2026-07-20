// Tiny tactile feedback for key moments (check-in success, approvals).
// Touch devices only; desktop and unsupported browsers no-op silently.
export function haptic(pattern = 12) {
  try {
    if (!window.matchMedia?.("(pointer: coarse)")?.matches) return;
    navigator.vibrate?.(pattern);
  } catch {
    /* never let feedback break the action */
  }
}
