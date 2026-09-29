// Генератор коротких кодов для шаринга — общий для плейлистов
// (playlistApi.ts) и для разовой передачи бита (sharedBeatApi.ts).
const CODE_ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789' // без l/1, o/0 — легче читать вслух
const CODE_LENGTH = 6

export function generateCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return code
}
