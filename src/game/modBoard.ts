const MOD_BOARD_KEY = 'artists-mod-board'

/** This browser/machine only — not based on who created the room. */
export function isModBoardComputer() {
  try {
    return localStorage.getItem(MOD_BOARD_KEY) === '1'
  } catch {
    return false
  }
}

export function enableModBoardComputer() {
  try {
    localStorage.setItem(MOD_BOARD_KEY, '1')
  } catch {
    /* private browsing */
  }
}

/** Call once on app boot. `?mod=1` permanently marks this computer as the mod board. */
export function syncModBoardFromUrl() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('mod') !== '1') return false
  enableModBoardComputer()
  params.delete('mod')
  const url = new URL(window.location.href)
  url.search = params.toString()
  window.history.replaceState(null, '', url)
  return true
}
