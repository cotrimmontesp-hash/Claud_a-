import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import * as Speech from "expo-speech";

import { askNexa, createImage, Mode, updateMemory } from "./api";
import { Attachment, pickMedia, shareImage, storeImage } from "./media";
import {
  Reminder,
  cancelReminder,
  extractReminders,
  formatWhen,
  hidePartialTag,
  ensureWebReminders,
  loadReminders,
  saveReminders,
  scheduleReminder,
} from "./reminders";
import { API_URL } from "./api";
import { searchConversations } from "./searchConvs";
import { extractHashtags } from "./hashtags";
import {
  ChatMessage,
  Conversation,
  DEFAULT_PROFILE,
  Feedback,
  Profile,
  loadConversations,
  loadMode,
  loadProfile,
  saveConversations,
  saveMode,
  saveProfile,
} from "./storage";
import Markdown from "./Markdown";
import { expandCommand, matchCommands } from "./commands";
import Settings from "./Settings";
import { exportConversation } from "./exportChat";
import { colors } from "./theme";

const icon = require("../assets/icon.png");

const SUGESTOES: [string, string][] = [
  ["🎬 Roteiro de TikTok", "de 30 segundos sobre uma curiosidade"],
  ["💡 Ideias", "de nomes para um canal de futebol"],
  ["📚 Me explica", "como funciona a inteligência artificial"],
  ["💰 Finanças", "como montar um orçamento simples"],
];

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <ChatScreen />
    </SafeAreaProvider>
  );
}

function ChatScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const [convs, setConvs] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("rapida");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sideOpen, setSideOpen] = useState(false);
  const [convQuery, setConvQuery] = useState("");
  const [listening, setListening] = useState(false);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [showSettings, setShowSettings] = useState(false);
  const [learned, setLearned] = useState<string | null>(null);
  const profileRef = useRef<Profile>(DEFAULT_PROFILE);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [imageMode, setImageMode] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchOn, setSearchOn] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const remindersRef = useRef<Reminder[]>([]);

  const scrollRef = useRef<ScrollView>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      const [c, m, p, r] = await Promise.all([loadConversations(), loadMode(), loadProfile(), loadReminders()]);
      remindersRef.current = r;
      setReminders(r);
      ensureWebReminders(r);
      convsRef.current = c;
      setConvs(c);
      setCurrentId(c[0]?.id ?? null);
      setMode(m);
      setProfile(p);
      profileRef.current = p;
    })();
  }, []);

  const current = convs.find((c) => c.id === currentId);
  const busy = streaming !== null;

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const convsRef = useRef<Conversation[]>([]);
  const persist = (next: Conversation[]) => {
    convsRef.current = next;
    setConvs(next);
    saveConversations(next);
  };

  const changeProfile = (p: Profile) => {
    profileRef.current = p;
    setProfile(p);
    saveProfile(p);
  };

  // Depois de cada resposta, a IA decide se aprendeu algo novo sobre o usuário.
  async function learnFrom(user: string, assistant: string) {
    const p = profileRef.current;
    if (!p.memoryOn) return;
    const { add, remove } = await updateMemory(p.memories, user, assistant);
    if (!add.length && !remove.length) return;
    const latest = profileRef.current;
    const kept = latest.memories.filter((m) => !remove.includes(m));
    const fresh = add.filter((a) => !kept.some((k) => k.toLowerCase() === a.toLowerCase()));
    if (!fresh.length && kept.length === latest.memories.length) return;
    changeProfile({ ...latest, memories: [...kept, ...fresh].slice(-60) });
    if (fresh.length) {
      setLearned(fresh[0]);
      setTimeout(() => setLearned(null), 4000);
    }
  }

  function feedbackKey(sample: string) {
    let h = 0;
    for (let i = 0; i < sample.length; i++) h = (Math.imul(h, 31) + sample.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  function giveFeedback(index: number, fb: Feedback | undefined, reason?: string) {
    const conv = convsRef.current.find((c) => c.id === currentId);
    if (!conv) return;
    const msg = conv.messages[index];
    if (!msg || msg.role !== "assistant") return;
    const messages = conv.messages.map((m, i) => (i === index ? { ...m, feedback: fb } : m));
    persist(convsRef.current.map((c) => (c.id === conv.id ? { ...conv, messages } : c)));

    const p = profileRef.current;
    const sample = msg.content.replace(/\s+/g, " ").slice(0, 300);
    const key = feedbackKey(sample);
    const withoutThis = p.dislikes.filter((d) => !d.endsWith("\u0001" + key));
    if (!fb) {
      changeProfile({ ...p, likes: p.likes.filter((l) => l !== sample), dislikes: withoutThis });
    } else if (fb === "up") {
      changeProfile({
        ...p,
        likes: [...p.likes.filter((l) => l !== sample), sample].slice(-3),
        dislikes: withoutThis,
      });
    } else if (fb === "down") {
      const note = reason?.trim()
        ? reason.trim().slice(0, 240)
        : `Não curtiu uma resposta parecida com: "${sample.slice(0, 100)}"`;
      changeProfile({
        ...p,
        likes: p.likes.filter((l) => l !== sample),
        dislikes: [...withoutThis, `${note}\u0001${key}`].slice(-20),
      });
    }
  }

  function showNotice(t: string) {
    setNotice(t);
    setTimeout(() => setNotice(null), 6000);
  }

  function setRemindersAll(next: Reminder[]) {
    remindersRef.current = next;
    setReminders(next);
    saveReminders(next);
    ensureWebReminders(next);
  }

  async function createReminders(found: { date: Date; text: string }[]): Promise<string[]> {
    const lines: string[] = [];
    const added: Reminder[] = [];
    for (const f of found) {
      if (f.date.getTime() < Date.now() - 60000) {
        lines.push(`⚠️ Não marquei "${f.text}": o horário ${formatWhen(f.date)} já passou.`);
        continue;
      }
      try {
        const id = newId();
        const notifId = await scheduleReminder(f.text, f.date, id);
        added.push({ id, when: f.date.toISOString(), text: f.text, notifId });
        lines.push(`⏰ Lembrete marcado: **${f.text}** — ${formatWhen(f.date)}`);
      } catch (e: any) {
        lines.push(`⚠️ ${e?.message || "Não consegui marcar o lembrete."}`);
      }
    }
    if (added.length) setRemindersAll([...remindersRef.current, ...added]);
    if (added.length && Platform.OS === "web") {
      lines.push("*No site, o aviso só aparece se esta aba estiver aberta. No app do celular a notificação chega mesmo fechado.*");
    }
    return lines;
  }

  async function removeReminder(r: Reminder) {
    await cancelReminder(r);
    setRemindersAll(remindersRef.current.filter((x) => x.id !== r.id));
  }

  function openEditor() {
    if (Platform.OS === "web" && typeof window !== "undefined") window.location.href = "/editor.html";
    else Linking.openURL(`${API_URL}/editor.html`);
  }

  async function attach() {
    try {
      const a = await pickMedia();
      if (a) setAttachment(a);
    } catch (e: any) {
      showNotice(e?.message || "Não consegui abrir esse arquivo.");
    }
  }

  // Guarda o último pedido que falhou, para o botão "Tentar de novo".
  const retryRef = useRef<{ convId: string; typed: string; att: Attachment | null; image: boolean } | null>(null);

  async function send(textArg?: string, retry?: { att: Attachment | null; image: boolean }) {
    if (busy) {
      abortRef.current?.abort();
      return;
    }
    const att = retry ? retry.att : attachment;
    let text = (textArg ?? input).trim();
    if (!text && !att) return;
    if (!text && att) text = att.kind === "video" ? "Analise esse vídeo e me diga como melhorar." : "O que você acha dessa imagem?";
    const wantsImage = retry ? retry.image : imageMode;
    const typed = text;
    if (!wantsImage) text = expandCommand(text);
    if (!retry) setInput("");
    setAttachment(null);
    setError(null);
    retryRef.current = null;

    let base: Conversation = current ?? { id: newId(), title: "", messages: [] };
    // Ao tentar de novo, tira a pergunta que ficou sem resposta (ela é enviada outra vez).
    if (retry && base.messages[base.messages.length - 1]?.role === "user") {
      base = { ...base, messages: base.messages.slice(0, -1) };
    }
    const userMsg: ChatMessage = { role: "user", content: text };
    if (att) {
      userMsg.attachment = {
        kind: att.kind,
        uri: att.kind === "image" ? `data:${att.mime};base64,${att.data}` : att.uri,
      };
    }
    const conv: Conversation = {
      ...base,
      title: base.title || (wantsImage ? "🖼️ " : "") + typed.slice(0, 40),
      messages: [...base.messages, userMsg],
    };
    let list = [conv, ...convsRef.current.filter((c) => c.id !== conv.id)];
    persist(list);
    setCurrentId(conv.id);
    setStreaming("");
    scrollDown();

    const controller = new AbortController();
    abortRef.current = controller;
    let full = "";
    let image: string | undefined;
    try {
      if (wantsImage) {
        setStreaming("🎨 Criando a imagem… (pode levar até 1 minuto)");
        const img = await createImage(
          text,
          att && att.kind === "image" ? { mime: att.mime, data: att.data } : undefined,
          controller.signal
        );
        image = await storeImage(img.data, img.mime);
        full = `🖼️ Imagem criada: ${text}`;
      } else {
        full = await askNexa(
          conv.messages.map(({ role, content, attachment: a }, idx, arr) => ({
            role,
            content:
              a && idx < arr.length - 1
                ? `${content}\n[Nesta mensagem o usuário tinha mandado ${a.kind === "video" ? "um vídeo" : "uma foto"}]`
                : content,
          })),
          mode,
          profileRef.current,
          (t) => {
            full = t;
            setStreaming(hidePartialTag(t));
            scrollDown();
          },
          controller.signal,
          att ? { mime: att.mime, data: att.data } : undefined,
          searchOn
        );
        const { clean, found } = extractReminders(full);
        if (found.length) {
          const lines = await createReminders(found);
          full = [clean, ...lines].filter(Boolean).join("\n\n");
        } else full = clean || full;
      }
    } catch (e: any) {
      if (e?.name !== "AbortError" && !controller.signal.aborted) {
        setError(e?.message || "Não consegui responder agora.");
        retryRef.current = { convId: conv.id, typed, att, image: wantsImage };
      }
      if (wantsImage) full = "";
    } finally {
      abortRef.current = null;
      setStreaming(null);
      if (full && convsRef.current.some((c) => c.id === conv.id)) {
        const reply: ChatMessage = { role: "assistant", content: full };
        if (image) reply.image = image;
        const done: Conversation = { ...conv, messages: [...conv.messages, reply] };
        list = [done, ...convsRef.current.filter((c) => c.id !== done.id)];
        persist(list);
        if (!wantsImage) learnFrom(text, full);
      }
      scrollDown();
    }
  }

  function retryLast() {
    const r = retryRef.current;
    if (!r || busy || r.convId !== currentId) return;
    send(r.typed, { att: r.att, image: r.image });
  }

  function newChat() {
    if (busy) abortRef.current?.abort();
    setCurrentId(null);
    setError(null);
    setSideOpen(false);
  }

  function deleteConv(id: string) {
    const next = convsRef.current.filter((c) => c.id !== id);
    persist(next);
    if (currentId === id) setCurrentId(next[0]?.id ?? null);
  }

  async function exportChat() {
    if (!current || !current.messages.length) return;
    try {
      const r = await exportConversation(current, aiName, profile.userName.trim() || "Você");
      if (r === "copiado") showNotice("📋 Conversa copiada! É só colar onde quiser.");
    } catch {
      showNotice("Não consegui exportar a conversa agora.");
    }
  }

  function changeMode(m: Mode) {
    setMode(m);
    saveMode(m);
  }

  // Ditado por voz (no navegador). No celular, o teclado já tem o microfone.
  const SR: any =
    Platform.OS === "web" && typeof window !== "undefined"
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;

  function toggleMic() {
    if (!SR) return;
    if (recRef.current) {
      recRef.current.stop();
      return;
    }
    const rec = new SR();
    rec.lang = "pt-BR";
    rec.interimResults = true;
    const start = input;
    rec.onresult = (e: any) => {
      const t = Array.from(e.results)
        .map((r: any) => r[0].transcript)
        .join("");
      setInput(start + t);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  const messages: ChatMessage[] = current?.messages ?? [];
  const aiName = profile.assistantName.trim() || "Nexa";
  const showWelcome = !messages.length && !busy;
  const cmdMatches = imageMode ? [] : matchCommands(input);

  const convHits = searchConversations(convs, convQuery);

  const sidebar = (
    <View style={[s.side, wide ? s.sideWide : s.sideFloat]}>
      <Pressable style={s.newBtn} onPress={newChat}>
        <Text style={s.newBtnText}>＋ Nova conversa</Text>
      </Pressable>
      {convs.length > 1 && (
        <View style={s.searchBox}>
          <Text style={s.searchIcon}>🔎</Text>
          <TextInput
            value={convQuery}
            onChangeText={setConvQuery}
            placeholder="Buscar nas conversas"
            placeholderTextColor={colors.muted}
            style={s.searchInput}
            returnKeyType="search"
          />
          {!!convQuery && (
            <Pressable hitSlop={10} onPress={() => setConvQuery("")}>
              <Text style={s.convDel}>✕</Text>
            </Pressable>
          )}
        </View>
      )}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 4 }} keyboardShouldPersistTaps="handled">
        {!!convQuery.trim() && !convHits.length && <Text style={s.searchEmpty}>Nada encontrado para “{convQuery.trim()}”.</Text>}
        {convHits.map(({ conv: c, snippet }) => (
          <Pressable
            key={c.id}
            style={[s.conv, c.id === currentId && s.convOn]}
            onPress={() => {
              setCurrentId(c.id);
              setError(null);
              setSideOpen(false);
            }}
          >
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[s.convText, { flex: 0 }, c.id === currentId && { color: colors.text }]}>
                {c.title || "Nova conversa"}
              </Text>
              {!!snippet && (
                <Text numberOfLines={2} style={s.convSnippet}>
                  {snippet}
                </Text>
              )}
            </View>
            <Pressable hitSlop={10} onPress={() => deleteConv(c.id)}>
              <Text style={s.convDel}>✕</Text>
            </Pressable>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable
        style={s.sideSettings}
        onPress={() => {
          setSideOpen(false);
          setShowSettings(true);
        }}
      >
        <Text style={s.sideSettingsText}>⚙️ Personalidade e memória</Text>
      </Pressable>
      <Text style={s.sideFoot}>{aiName} • suas conversas ficam salvas só neste aparelho</Text>
    </View>
  );

  return (
    <SafeAreaView style={s.root} edges={["top", "bottom", "left", "right"]}>
      <View style={{ flex: 1, flexDirection: "row" }}>
        {wide && sidebar}

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {/* Cabeçalho */}
          <View style={s.header}>
            {!wide && (
              <Pressable style={s.iconBtn} onPress={() => setSideOpen(true)}>
                <Text style={{ color: colors.text, fontSize: 20 }}>☰</Text>
              </Pressable>
            )}
            <View style={s.brand}>
              <Image source={icon} style={s.brandImg} />
              <Text style={s.brandText} numberOfLines={1}>{aiName}</Text>
            </View>
            {messages.length > 0 && (
              <Pressable style={s.iconBtn} onPress={exportChat} accessibilityLabel="Exportar conversa">
                <Text style={{ fontSize: 18 }}>📤</Text>
              </Pressable>
            )}
            <Pressable style={s.iconBtn} onPress={() => setShowSettings(true)}>
              <Text style={{ fontSize: 18 }}>⚙️</Text>
            </Pressable>
            <View style={s.modeBox}>
              {(["rapida", "esperta"] as Mode[]).map((m) => (
                <Pressable key={m} onPress={() => changeMode(m)} style={[s.modeBtn, mode === m && s.modeOn]}>
                  <Text style={[s.modeText, mode === m && { color: colors.text }]}>
                    {m === "rapida" ? "⚡ Rápida" : "🧠 Esperta"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Mensagens */}
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={s.chat}
            keyboardShouldPersistTaps="handled"
          >
            {showWelcome ? (
              <View style={s.welcome}>
                <Image source={icon} style={s.welcomeImg} />
                <Text style={s.welcomeTitle}>
                  {profile.userName.trim() ? `Oi, ${profile.userName.trim()}! ` : "Oi! "}Eu sou a {aiName} 👋
                </Text>
                <Text style={s.welcomeSub}>Pergunte, peça ideias, textos, roteiros… o que precisar.</Text>
                <View style={s.chips}>
                  {SUGESTOES.map(([t, sub]) => (
                    <Pressable key={t} style={s.chip} onPress={() => send(`${t.slice(2).trim()} ${sub}`)}>
                      <Text style={s.chipTitle}>{t}</Text>
                      <Text style={s.chipSub}>{sub}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <>
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <UserBubble key={i} text={m.content} attachment={m.attachment} />
                  ) : (
                    <BotBubble
                      key={i}
                      text={m.content}
                      image={m.image}
                      feedback={m.feedback}
                      onFeedback={(fb, reason) => giveFeedback(i, fb, reason)}
                    />
                  )
                )}
                {busy && <BotBubble text={streaming || ""} loading />}
                {error && (
                  <View style={s.botRow}>
                    <Image source={icon} style={s.avatar} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.errText}>Ops, não consegui responder agora ({error}).</Text>
                      {retryRef.current?.convId === currentId && (
                        <Pressable style={[s.tool, { alignSelf: "flex-start", marginTop: 6 }]} onPress={retryLast}>
                          <Text style={s.toolText}>🔁 Tentar de novo</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {/* Caixa de texto */}
          {learned && (
            <View style={s.toast}>
              <Text style={s.toastText} numberOfLines={2}>🧠 Aprendi: {learned}</Text>
            </View>
          )}

          {notice && (
            <View style={s.toast}>
              <Text style={s.toastText}>{notice}</Text>
            </View>
          )}

          <View style={s.footer}>
            <View style={s.chipsRow}>
              <Pressable
                style={[s.modeChip, profile.videoMode && s.modeChipOn]}
                onPress={() => changeProfile({ ...profile, videoMode: !profile.videoMode })}
              >
                <Text style={[s.modeChipText, profile.videoMode && { color: colors.text }]}>🎬 Vídeo</Text>
              </Pressable>
              <Pressable style={[s.modeChip, imageMode && s.modeChipOn]} onPress={() => setImageMode(!imageMode)}>
                <Text style={[s.modeChipText, imageMode && { color: colors.text }]}>🖼️ Imagem</Text>
              </Pressable>
              <Pressable style={[s.modeChip, searchOn && s.modeChipOn]} onPress={() => setSearchOn(!searchOn)}>
                <Text style={[s.modeChipText, searchOn && { color: colors.text }]}>🌐 Internet</Text>
              </Pressable>
              <Pressable style={s.modeChip} onPress={openEditor}>
                <Text style={s.modeChipText}>🎞️ Editor</Text>
              </Pressable>
            </View>
            {attachment && (
              <View style={s.attachPreview}>
                {attachment.kind === "image" ? (
                  <Image source={{ uri: attachment.uri }} style={s.attachThumb} />
                ) : (
                  <View style={[s.attachThumb, s.videoThumb]}>
                    <Text style={{ fontSize: 22 }}>🎞️</Text>
                  </View>
                )}
                <Text style={s.attachText} numberOfLines={1}>
                  {attachment.kind === "video" ? "Vídeo pronto para enviar" : imageMode ? "Foto de referência" : "Foto pronta para enviar"}
                </Text>
                <Pressable hitSlop={10} onPress={() => setAttachment(null)}>
                  <Text style={s.convDel}>✕</Text>
                </Pressable>
              </View>
            )}
            {cmdMatches.length > 0 && (
              <View style={s.cmdList}>
                {cmdMatches.map((c) => (
                  <Pressable key={c.name} style={s.cmdItem} onPress={() => setInput(`/${c.name} `)}>
                    <Text style={s.cmdName}>{c.label}</Text>
                    <Text style={s.cmdHint} numberOfLines={1}>{c.hint} — digite o tema depois</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <View style={s.box}>
              <Pressable style={s.mic} onPress={attach} disabled={busy}>
                <Text style={{ fontSize: 18 }}>📎</Text>
              </Pressable>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={
                  imageMode
                    ? "Descreva a imagem que você quer…"
                    : profile.videoMode
                    ? "Peça um roteiro, edição, ideia de vídeo…"
                    : "Pergunte algo ou digite / para atalhos…"
                }
                placeholderTextColor={colors.muted}
                style={s.input}
                multiline
                onKeyPress={(e: any) => {
                  const fine =
                    Platform.OS === "web" &&
                    typeof window !== "undefined" &&
                    !!window.matchMedia?.("(pointer: fine)")?.matches;
                  if (fine && e.nativeEvent.key === "Enter" && !e.nativeEvent.shiftKey) {
                    e.preventDefault?.();
                    send();
                  }
                }}
              />
              {SR && (
                <Pressable style={[s.mic, listening && s.micOn]} onPress={toggleMic}>
                  <Text style={{ fontSize: 18 }}>🎤</Text>
                </Pressable>
              )}
              <Pressable style={s.send} onPress={() => send()}>
                <Text style={s.sendText}>{busy ? "■" : "➤"}</Text>
              </Pressable>
            </View>
            <Text style={s.note}>A Nexa pode errar. Confira informações importantes.</Text>
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* Menu lateral no celular */}
      {showSettings && (
        <Settings
          profile={profile}
          onChange={changeProfile}
          onClose={() => setShowSettings(false)}
          reminders={reminders}
          onRemoveReminder={removeReminder}
        />
      )}

      {!wide && sideOpen && !showSettings && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={s.shade} onPress={() => setSideOpen(false)} />
          {sidebar}
        </View>
      )}
    </SafeAreaView>
  );
}

function UserBubble({ text, attachment }: { text: string; attachment?: { kind: "image" | "video"; uri: string } }) {
  return (
    <View style={s.userRow}>
      <View style={s.userBubble}>
        {attachment &&
          (attachment.kind === "image" && attachment.uri ? (
            <Image source={{ uri: attachment.uri }} style={s.sentImage} resizeMode="cover" />
          ) : (
            <Text style={s.sentFile}>{attachment.kind === "video" ? "🎞️ Vídeo enviado" : "📷 Foto enviada"}</Text>
          ))}
        <Text style={s.userText} selectable>{text}</Text>
      </View>
    </View>
  );
}

function BotBubble({
  text,
  image,
  loading,
  feedback,
  onFeedback,
}: {
  text: string;
  image?: string;
  loading?: boolean;
  feedback?: Feedback;
  onFeedback?: (fb: Feedback | undefined, reason?: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [tagsCopied, setTagsCopied] = useState(false);
  const tags = loading ? [] : extractHashtags(text);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <View style={s.botRow}>
      <Image source={icon} style={s.avatar} />
      <View style={{ flex: 1, paddingTop: 4 }}>
        {image && (
          <View style={{ marginBottom: 8 }}>
            <Image source={{ uri: image }} style={s.genImage} resizeMode="cover" />
            <Pressable style={[s.tool, { alignSelf: "flex-start", marginTop: 6 }]} onPress={() => shareImage(image)}>
              <Text style={s.toolText}>💾 Salvar / compartilhar</Text>
            </Pressable>
          </View>
        )}
        {text ? <Markdown text={text} /> : <ActivityIndicator color={colors.muted} style={{ alignSelf: "flex-start" }} />}
        {!loading && !!text && (
          <View style={s.tools}>
            <Pressable
              style={s.tool}
              onPress={async () => {
                await Clipboard.setStringAsync(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              <Text style={s.toolText}>{copied ? "✅ Copiado" : "📋 Copiar"}</Text>
            </Pressable>
            {tags.length > 0 && (
              <Pressable
                style={s.tool}
                onPress={async () => {
                  await Clipboard.setStringAsync(tags.join(" "));
                  setTagsCopied(true);
                  setTimeout(() => setTagsCopied(false), 1500);
                }}
              >
                <Text style={s.toolText}>{tagsCopied ? "✅ Hashtags copiadas" : `#️⃣ Copiar hashtags (${tags.length})`}</Text>
              </Pressable>
            )}
            <Pressable
              style={s.tool}
              onPress={() => {
                Speech.stop();
                Speech.speak(text.replace(/[*#`_>]/g, ""), { language: "pt-BR" });
              }}
            >
              <Text style={s.toolText}>🔊 Ouvir</Text>
            </Pressable>
            {onFeedback && (
              <>
                <Pressable
                  style={[s.tool, feedback === "up" && s.toolOn]}
                  onPress={() => {
                    setAsking(false);
                    onFeedback(feedback === "up" ? undefined : "up");
                  }}
                >
                  <Text style={s.toolText}>👍</Text>
                </Pressable>
                <Pressable
                  style={[s.tool, feedback === "down" && s.toolOn]}
                  onPress={() => {
                    if (feedback === "down") {
                      onFeedback(undefined);
                      setAsking(false);
                    } else setAsking(true);
                  }}
                >
                  <Text style={s.toolText}>👎</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
        {asking && onFeedback && (
          <View style={s.fbBox}>
            <Text style={s.fbTitle}>O que você não gostou? (opcional)</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Ex.: muito longa, pouca ideia criativa…"
              placeholderTextColor={colors.muted}
              style={s.fbInput}
              multiline
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                style={s.fbSend}
                onPress={() => {
                  onFeedback("down", reason);
                  setAsking(false);
                  setReason("");
                }}
              >
                <Text style={s.fbSendText}>Enviar</Text>
              </Pressable>
              <Pressable style={s.fbCancel} onPress={() => setAsking(false)}>
                <Text style={s.toolText}>Cancelar</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  side: { backgroundColor: colors.panel, padding: 14, borderRightWidth: 1, borderRightColor: colors.border },
  sideWide: { width: 280 },
  sideFloat: { position: "absolute", top: 0, bottom: 0, left: 0, width: 280 },
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  newBtn: { backgroundColor: colors.accent2, borderRadius: 12, padding: 12, alignItems: "center", marginBottom: 14 },
  newBtnText: { color: "#fff", fontWeight: "700" },
  conv: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: 10 },
  convOn: { backgroundColor: colors.panel2 },
  convText: { flex: 1, color: colors.muted, fontSize: 14 },
  convDel: { color: colors.muted, paddingHorizontal: 4 },
  convSnippet: { color: colors.muted, fontSize: 12, marginTop: 2, opacity: 0.85 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.panel2,
    borderRadius: 10,
    paddingHorizontal: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: { fontSize: 13 },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 8 },
  searchEmpty: { color: colors.muted, fontSize: 13, padding: 10 },
  sideFoot: { color: colors.muted, fontSize: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconBtn: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  brand: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 },
  brandImg: { width: 28, height: 28, borderRadius: 8 },
  brandText: { color: colors.text, fontWeight: "700", fontSize: 18 },
  modeBox: { flexDirection: "row", backgroundColor: colors.panel, borderRadius: 999, padding: 3 },
  modeBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999 },
  modeOn: { backgroundColor: colors.panel2 },
  modeText: { color: colors.muted, fontSize: 12 },

  chat: { padding: 12, paddingTop: 16, gap: 16, maxWidth: 760, width: "100%", alignSelf: "center" },
  userRow: { flexDirection: "row", justifyContent: "flex-end" },
  userBubble: {
    backgroundColor: colors.user,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    maxWidth: "88%",
  },
  userText: { color: colors.text, fontSize: 15.5, lineHeight: 22 },
  botRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  avatar: { width: 30, height: 30, borderRadius: 9 },
  errText: { color: colors.error, flex: 1, paddingTop: 5, fontSize: 15 },
  tools: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tool: { backgroundColor: colors.panel, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
  toolText: { color: colors.muted, fontSize: 12 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, maxWidth: 760, width: "100%", alignSelf: "center", marginBottom: 8 },
  modeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  modeChipOn: { borderColor: colors.accent, backgroundColor: colors.panel2 },
  modeChipText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  attachPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
    backgroundColor: colors.panel,
    borderRadius: 14,
    padding: 8,
    marginBottom: 8,
  },
  cmdList: {
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 6,
    marginBottom: 8,
  },
  cmdItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10 },
  cmdName: { color: colors.text, fontWeight: "700", fontSize: 14 },
  cmdHint: { flex: 1, color: colors.muted, fontSize: 13 },
  attachThumb: { width: 48, height: 48, borderRadius: 10 },
  videoThumb: { backgroundColor: colors.panel2, alignItems: "center", justifyContent: "center" },
  attachText: { flex: 1, color: colors.text, fontSize: 14 },
  sentImage: { width: 220, height: 220, borderRadius: 12, marginBottom: 8 },
  sentFile: { color: colors.text, fontSize: 14, marginBottom: 6 },
  genImage: { width: "100%", maxWidth: 420, aspectRatio: 1, borderRadius: 14, backgroundColor: colors.panel },
  toolOn: { backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.accent2 },
  fbBox: { marginTop: 8, backgroundColor: colors.panel, borderRadius: 12, padding: 12, gap: 8 },
  fbTitle: { color: colors.text, fontSize: 13, fontWeight: "600" },
  fbInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    color: colors.text,
    fontSize: 15,
    padding: 10,
    minHeight: 44,
  },
  fbSend: { backgroundColor: colors.accent2, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16 },
  fbSendText: { color: "#fff", fontWeight: "700" },
  fbCancel: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  toast: {
    alignSelf: "center",
    maxWidth: 520,
    marginHorizontal: 12,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.accent2,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  toastText: { color: colors.text, fontSize: 13 },
  sideSettings: { padding: 12, borderRadius: 10, backgroundColor: colors.panel2, marginTop: 10 },
  sideSettingsText: { color: colors.text, fontSize: 14, fontWeight: "600" },

  welcome: { alignItems: "center", paddingVertical: 30, paddingHorizontal: 8 },
  welcomeImg: { width: 72, height: 72, borderRadius: 20, marginBottom: 14 },
  welcomeTitle: { color: colors.text, fontSize: 24, fontWeight: "700", marginBottom: 6 },
  welcomeSub: { color: colors.muted, marginBottom: 22, textAlign: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", maxWidth: 560 },
  chip: {
    width: "47%",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
  },
  chipTitle: { color: colors.text, fontWeight: "700", marginBottom: 3, fontSize: 14 },
  chipSub: { color: colors.muted, fontSize: 13 },

  footer: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10 },
  box: {
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    paddingVertical: 6,
    paddingRight: 6,
    paddingLeft: 16,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    maxHeight: 160,
    paddingTop: 10,
    paddingBottom: 10,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null),
  },
  mic: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  micOn: { backgroundColor: "#ff4d4d" },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendText: { color: "#fff", fontSize: 18 },
  note: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: 6 },
});
