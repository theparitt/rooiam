export function isTrustedWidgetMessage(event: MessageEvent, frame: HTMLIFrameElement | null): frame is HTMLIFrameElement {
  if (!frame || event.source !== frame.contentWindow) return false
  try {
    return event.origin === new URL(frame.src).origin
  } catch {
    return false
  }
}

export function getWidgetNavigationUrl(value: string, frameUrl: string): string | null {
  try {
    const destination = new URL(value, frameUrl)
    if (['http:', 'https:'].includes(destination.protocol) && destination.origin === new URL(frameUrl).origin) {
      return destination.href
    }
  } catch { /* Ignore malformed navigation messages. */ }
  return null
}
