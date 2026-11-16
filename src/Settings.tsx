import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { DEFAULT_PROFILE, Profile, Tone } from "./storage";
import { Reminder, formatWhen } from "./reminders";
import { colors } from "./theme";

const TONES: { key: Tone; label: string; desc: string }[] = [
  { key: "equilibrada", label: "😊 Equilibrada", desc: "Simpática e direta" },
  { key: "divertida", label: "😂 Divertida", desc: "Brincalhona e animada" },
  { key: "seria", label: "🧐 Séria", desc: "Objetiva, sem piadas" },
  { key: "girias", label: "😎 Com gírias", desc: "Fala como a galera" },
];

type Props = {
  profile: Profile;
  onChange: (p: Profile) => void;
  onClose: () => void;
  reminders: Reminder[];
  onRemoveReminder: (r: Reminder) => void;
};

export default function Settings({ profile, onChange, onClose, reminders, onRemoveReminder }: Props) {
  const [tab, setTab] = useState<"jeito" | "memoria" | "lembretes">("jeito");
  const upcoming = [...reminders].sort((a, b) => a.when.localeCompare(b.when));
  const [newMemory, setNewMemory] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const set = (patch: Partial<Profile>) => onChange({ ...profile, ...patch });

  function addMemory() {
    const t = newMemory.trim();
    if (!t) return;
    set({ memories: [...profile.memories, t].slice(-60) });
    setNewMemory("");
  }

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>Ajustes</Text>
        <Pressable onPress={onClose} hitSlop={10} style={s.close}>
          <Text style={s.closeText}>Pronto</Text>
        </Pressable>
      </View>

      <View style={s.tabs}>
        <Pressable style={[s.tab, tab === "jeito" && s.tabOn]} onPress={() => setTab("jeito")}>
          <Text style={[s.tabText, tab === "jeito" && s.tabTextOn]}>🎭 Personalidade</Text>
        </Pressable>
        <Pressable style={[s.tab, tab === "memoria" && s.tabOn]} onPress={() => setTab("memoria")}>
          <Text style={[s.tabText, tab === "memoria" && s.tabTextOn]}>
            🧠 Memória ({profile.memories.length})
          </Text>
        </Pressable>
        <Pressable style={[s.tab, tab === "lembretes" && s.tabOn]} onPress={() => setTab("lembretes")}>
          <Text style={[s.tabText, tab === "lembretes" && s.tabTextOn]}>⏰ ({reminders.length})</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {tab === "lembretes" ? (
          <>
            <Text style={s.note}>
              Para criar, é só pedir no chat. Ex.: "me lembra de postar o vídeo hoje às 18h" ou "amanhã às 9h me avisa
              de editar o vídeo".
            </Text>
            {upcoming.length === 0 && <Text style={s.empty}>Nenhum lembrete marcado.</Text>}
            {upcoming.map((r) => {
              const d = new Date(r.when);
              const past = d.getTime() < Date.now();
              return (
                <View key={r.id} style={[s.item, past && { opacity: 0.5 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemText}>{r.text}</Text>
                    <Text style={s.rowDesc}>
                      {past ? "Já passou • " : ""}
                      {formatWhen(d)}
                    </Text>
                  </View>
                  <Pressable hitSlop={10} onPress={() => onRemoveReminder(r)}>
                    <Text style={s.del}>✕</Text>
                  </Pressable>
                </View>
              );
            })}
          </>
        ) : tab === "jeito" ? (
          <>
            <Text style={s.label}>Nome da IA</Text>
            <TextInput
              value={profile.assistantName}
              onChangeText={(t) => set({ assistantName: t.slice(0, 30) })}
              placeholder="Nexa"
              placeholderTextColor={colors.muted}
              style={s.input}
            />

            <Text style={s.label}>Como ela deve te chamar</Text>
            <TextInput
              value={profile.userName}
              onChangeText={(t) => set({ userName: t.slice(0, 40) })}
              placeholder="Seu nome ou apelido"
              placeholderTextColor={colors.muted}
              style={s.input}
            />

            <Text style={s.label}>Jeito de falar</Text>
            <View style={s.grid}>
              {TONES.map((t) => (
                <Pressable
                  key={t.key}
                  style={[s.toneCard, profile.tone === t.key && s.toneOn]}
                  onPress={() => set({ tone: t.key })}
                >
                  <Text style={s.toneLabel}>{t.label}</Text>
                  <Text style={s.toneDesc}>{t.desc}</Text>
                </Pressable>
              ))}
            </View>

            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>Usar emojis</Text>
                <Text style={s.rowDesc}>Ela coloca alguns emojis nas respostas</Text>
              </View>
              <Switch
                value={profile.emojis}
                onValueChange={(v) => set({ emojis: v })}
                trackColor={{ true: colors.accent2, false: colors.panel2 }}
              />
            </View>

            <Text style={s.label}>Instruções extras (opcional)</Text>
            <TextInput
              value={profile.custom}
              onChangeText={(t) => set({ custom: t.slice(0, 1500) })}
              placeholder="Ex.: Responda sempre curto. Quando eu pedir roteiro, use ganchos fortes."
              placeholderTextColor={colors.muted}
              style={[s.input, s.multi]}
              multiline
            />

            <Pressable
              style={s.resetBtn}
              onPress={() =>
                set({
                  assistantName: DEFAULT_PROFILE.assistantName,
                  tone: DEFAULT_PROFILE.tone,
                  emojis: DEFAULT_PROFILE.emojis,
                  custom: "",
                })
              }
            >
              <Text style={s.resetText}>Voltar a personalidade ao padrão</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>Memória ligada</Text>
                <Text style={s.rowDesc}>
                  Ela aprende sobre você nas conversas e usa isso nas próximas respostas.
                </Text>
              </View>
              <Switch
                value={profile.memoryOn}
                onValueChange={(v) => set({ memoryOn: v })}
                trackColor={{ true: colors.accent2, false: colors.panel2 }}
              />
            </View>

            <Text style={s.note}>
              A memória fica salva neste aparelho. Ela é enviada para a IA (Google) junto com as mensagens,
              então evite guardar coisas pessoais ou senhas.
            </Text>

            <Text style={s.label}>Ensinar algo para ela</Text>
            <View style={s.addRow}>
              <TextInput
                value={newMemory}
                onChangeText={setNewMemory}
                placeholder="Ex.: Tenho um TikTok de curiosidades"
                placeholderTextColor={colors.muted}
                style={[s.input, { flex: 1 }]}
                onSubmitEditing={addMemory}
              />
              <Pressable style={s.addBtn} onPress={addMemory}>
                <Text style={s.addBtnText}>＋</Text>
              </Pressable>
            </View>

            <Text style={s.label}>O que ela sabe sobre você</Text>
            {profile.memories.length === 0 && (
              <Text style={s.empty}>Nada ainda. Converse com ela que ela vai aprendendo.</Text>
            )}
            {profile.memories.map((m, i) => (
              <View key={i + m} style={s.item}>
                <Text style={s.itemText}>{m}</Text>
                <Pressable
                  hitSlop={10}
                  onPress={() => set({ memories: profile.memories.filter((_, j) => j !== i) })}
                >
                  <Text style={s.del}>✕</Text>
                </Pressable>
              </View>
            ))}

            {profile.dislikes.length > 0 && (
              <>
                <Text style={s.label}>Coisas que você não gostou (👎)</Text>
                {profile.dislikes.map((m, i) => (
                  <View key={i + m} style={s.item}>
                    <Text style={s.itemText}>{m}</Text>
                    <Pressable
                      hitSlop={10}
                      onPress={() => set({ dislikes: profile.dislikes.filter((_, j) => j !== i) })}
                    >
                      <Text style={s.del}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </>
            )}

            {profile.likes.length > 0 && (
              <Text style={s.empty}>
                {profile.likes.length} resposta(s) que você curtiu (👍) servem de exemplo de estilo.
              </Text>
            )}

            {(profile.memories.length > 0 || profile.dislikes.length > 0 || profile.likes.length > 0) &&
              (confirmClear ? (
                <View style={s.confirm}>
                  <Text style={s.rowTitle}>Apagar tudo que ela aprendeu?</Text>
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                    <Pressable
                      style={[s.resetBtn, { flex: 1, borderColor: colors.error }]}
                      onPress={() => {
                        set({ memories: [], dislikes: [], likes: [] });
                        setConfirmClear(false);
                      }}
                    >
                      <Text style={[s.resetText, { color: colors.error }]}>Apagar</Text>
                    </Pressable>
                    <Pressable style={[s.resetBtn, { flex: 1 }]} onPress={() => setConfirmClear(false)}>
                      <Text style={s.resetText}>Cancelar</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable style={s.resetBtn} onPress={() => setConfirmClear(true)}>
                  <Text style={s.resetText}>Apagar toda a memória</Text>
                </Pressable>
              ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { flex: 1, color: colors.text, fontSize: 20, fontWeight: "700" },
  close: { backgroundColor: colors.accent2, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16 },
  closeText: { color: "#fff", fontWeight: "700" },
  tabs: { flexDirection: "row", gap: 8, padding: 12 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.panel, alignItems: "center" },
  tabOn: { backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.accent2 },
  tabText: { color: colors.muted, fontWeight: "600" },
  tabTextOn: { color: colors.text },
  body: { padding: 16, paddingTop: 4, gap: 8, maxWidth: 640, width: "100%", alignSelf: "center", paddingBottom: 40 },
  label: { color: colors.muted, fontSize: 13, marginTop: 14, marginBottom: 2, fontWeight: "600" },
  input: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  multi: { minHeight: 100, textAlignVertical: "top" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  toneCard: {
    width: "47%",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
  },
  toneOn: { borderColor: colors.accent, backgroundColor: colors.panel2 },
  toneLabel: { color: colors.text, fontWeight: "700", marginBottom: 3 },
  toneDesc: { color: colors.muted, fontSize: 13 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.panel,
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
  },
  rowTitle: { color: colors.text, fontWeight: "700", fontSize: 15 },
  rowDesc: { color: colors.muted, fontSize: 13, marginTop: 2 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  addRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: { color: "#fff", fontSize: 22, fontWeight: "700" },
  empty: { color: colors.muted, fontSize: 14, paddingVertical: 6 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.panel,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  itemText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
  del: { color: colors.muted, fontSize: 16, paddingHorizontal: 4 },
  resetBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 18,
  },
  resetText: { color: colors.muted, fontWeight: "600" },
  confirm: { backgroundColor: colors.panel, borderRadius: 14, padding: 14, marginTop: 18 },
});
