const api = import.meta.env.VITE_API_URL?.trim()
const loginWidget = import.meta.env.VITE_LOGIN_WIDGET_URL?.trim()

export function getApiBase() {
  if (!api) {
    throw new Error('Missing VITE_API_URL. Set it to your Rooiam API base, for example http://localhost:5180/v1.')
  }
  return api.replace(/\/+$/, '')
}

export function getLoginBase() {
  if (!loginWidget) {
    throw new Error('Missing VITE_LOGIN_WIDGET_URL. Set it to the Rooiam server origin that serves /login-widget, for example http://localhost:5180.')
  }
  return loginWidget.replace(/\/+$/, '')
}
