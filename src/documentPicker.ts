export type DocumentPickerAsset = {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
  type?: string;
  file?: File | Blob;
};

export type DocumentPickerResult = {
  canceled: boolean;
  assets: DocumentPickerAsset[];
};

function getDocumentPickerModule() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-document-picker");
  } catch {
    return null;
  }
}

export function isDocumentPickerAvailable() {
  return getDocumentPickerModule() !== null;
}

export async function getDocumentAsync(
  options?: Record<string, unknown>
): Promise<DocumentPickerResult> {
  const documentPicker = getDocumentPickerModule();
  if (!documentPicker) {
    throw new Error(
      "Document Picker is unavailable in this app build. Install the latest development build so the native expo-document-picker module is present."
    );
  }

  return documentPicker.getDocumentAsync(options);
}
