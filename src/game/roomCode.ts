import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './protocol'

export function generateRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH)
  crypto.getRandomValues(bytes)
  let code = ''
  for (const byte of bytes) {
    code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]
  }
  return code
}
