# Nexa IA

App de inteligência artificial em **React Native + Expo + TypeScript**.
Do mesmo código saem:

- **Site/PWA** na Vercel (React Native Web) — `npx expo export -p web`
- **APK/AAB Android** e **IPA iPhone** pelo EAS Build

A IA roda na função `api/chat.js` (Vercel). Hoje usa o Google Gemini grátis (variável `GEMINI_APK_KEY` na Vercel): Gemini 3.5 Flash-Lite no modo Rápida e Gemini 3.5 Flash no modo Esperta. Sem essa variável, usa o Vercel AI Gateway com Claude Sonnet 5.5 / Opus 5.5 (precisa de créditos).

Site: https://claude-ia-steel.vercel.app

## Batida do editor

No botão **Montar edit** ou **Montar curiosidade**, se a pessoa não escolher uma música, o editor cria no próprio aparelho uma batida sintética de cerca de 32 segundos (grave a 110–120 BPM). É uma onda gerada na hora, original deste app, sem amostra de música de terceiros e sem arquivo protegido no repositório.

## Gerar o APK
1. Crie uma conta grátis em https://expo.dev
2. No expo.dev, crie um projeto e conecte este repositório do GitHub
3. Rode um build Android com o perfil `preview` (gera APK para instalar direto)

Para a Play Store use o perfil `production` (gera AAB).
