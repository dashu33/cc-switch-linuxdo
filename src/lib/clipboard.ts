import { invoke } from "@tauri-apps/api/core";

export async function copyText(text: string): Promise<void> {
  try {
    await invoke("copy_text_to_clipboard", { text });
    return;
  } catch (nativeError) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (webError) {
      throw webError instanceof Error
        ? webError
        : nativeError instanceof Error
          ? nativeError
          : new Error(String(webError || nativeError));
    }
  }
}

export async function readText(): Promise<string> {
  try {
    const text = await invoke<string>("read_text_from_clipboard");
    return text ?? "";
  } catch (nativeError) {
    try {
      return (await navigator.clipboard.readText()) ?? "";
    } catch (webError) {
      throw webError instanceof Error
        ? webError
        : nativeError instanceof Error
          ? nativeError
          : new Error(String(webError || nativeError));
    }
  }
}
