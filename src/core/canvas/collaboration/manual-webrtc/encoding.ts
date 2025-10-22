const BASE64_CHUNK_SIZE = 0x8000;

export const encodeToBase64 = (bytes: Uint8Array): string => {
  if (bytes.length === 0) {
    return "";
  }

  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

export const decodeFromBase64 = (encoded: string): Uint8Array => {
  if (!encoded) {
    return new Uint8Array(0);
  }

  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};
