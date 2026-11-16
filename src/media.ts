import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

export type Attachment = {
  kind: "image" | "video";
  uri: string; // para mostrar na tela
  mime: string;
  data: string; // base64 sem o prefixo data:
};

// A Vercel aceita no máximo ~4,5 MB por envio; em base64 o arquivo cresce ~33%.
export const MAX_BYTES = 3 * 1024 * 1024;

async function blobToBase64(uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]+,/, ""));
    reader.onerror = () => reject(new Error("Não consegui ler o arquivo."));
    reader.readAsDataURL(blob);
  });
}

async function readBase64(uri: string): Promise<string> {
  if (Platform.OS === "web" || uri.startsWith("blob:") || uri.startsWith("data:")) return blobToBase64(uri);
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

function guessVideoMime(uri: string, mime?: string | null) {
  if (mime && mime.startsWith("video/")) return mime === "video/x-matroska" ? "video/webm" : mime;
  if (/\.mov$/i.test(uri)) return "video/quicktime";
  if (/\.webm$/i.test(uri)) return "video/webm";
  if (/\.3gp$/i.test(uri)) return "video/3gpp";
  return "video/mp4";
}

/** Abre a galeria para escolher uma foto ou um vídeo curto. Retorna null se cancelar. */
export async function pickMedia(): Promise<Attachment | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    quality: 1,
    videoMaxDuration: 60,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Low,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];

  if (asset.type === "video") {
    if (asset.fileSize && asset.fileSize > MAX_BYTES) {
      throw new Error(
        "Esse vídeo é grande demais. Mande um trecho curto (até uns 3 MB, cerca de 10 a 20 segundos em qualidade baixa)."
      );
    }
    const data = await readBase64(asset.uri);
    if (data.length * 0.75 > MAX_BYTES) {
      throw new Error(
        "Esse vídeo é grande demais. Mande um trecho curto (até uns 3 MB, cerca de 10 a 20 segundos em qualidade baixa)."
      );
    }
    return { kind: "video", uri: asset.uri, mime: guessVideoMime(asset.uri, asset.mimeType), data };
  }

  // Foto: diminui para no máximo 1280 px e comprime, para enviar rápido.
  const width = asset.width || 1280;
  const resized = await ImageManipulator.manipulateAsync(
    asset.uri,
    width > 1280 ? [{ resize: { width: 1280 } }] : [],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  if (!resized.base64) throw new Error("Não consegui ler a foto.");
  return { kind: "image", uri: resized.uri, mime: "image/jpeg", data: resized.base64 };
}

/** Guarda uma imagem criada pela IA e devolve um endereço para mostrar na tela. */
export async function storeImage(base64: string, mime: string): Promise<string> {
  if (Platform.OS === "web") return `data:${mime};base64,${base64}`;
  const ext = mime.includes("jpeg") ? "jpg" : "png";
  const path = `${FileSystem.documentDirectory}nexa-${Date.now()}.${ext}`;
  await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
  return path;
}

function imageMime(uri: string): string {
  const fromData = uri.match(/^data:(image\/[a-z0-9.+-]+);/i);
  if (fromData) return fromData[1].toLowerCase();
  if (/\.jpe?g($|\?)/i.test(uri)) return "image/jpeg";
  if (/\.webp($|\?)/i.test(uri)) return "image/webp";
  return "image/png";
}

function imageExt(mime: string): string {
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  return "png";
}

/** Salva ou compartilha a imagem (no celular abre o menu de compartilhar; no site baixa o arquivo). */
export async function shareImage(uri: string): Promise<void> {
  const mime = imageMime(uri);
  if (Platform.OS === "web") {
    const a = document.createElement("a");
    a.href = uri;
    a.download = `nexa-${Date.now()}.${imageExt(mime)}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: "Salvar ou compartilhar imagem" });
  }
}
