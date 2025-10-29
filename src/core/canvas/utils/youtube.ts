/**
 * Extracts a YouTube video ID from a given URL or string.
 * Supports various YouTube URL formats (e.g., watch, youtu.be, shorts, embed).
 * Also handles direct video IDs.
 * @param input - The URL or string potentially containing a YouTube video ID.
 * @returns The extracted 11-character YouTube video ID, or null if not found.
 */
export const extractYouTubeVideoId = (input: string): string | null => {
  const value = input.trim();
  if (!value) {
    return null; // Return null if the input is empty after trimming
  }

  // Check if the input is already a valid 11-character YouTube video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) {
    return value;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value);
  } catch {
    try {
      // Attempt to prepend https:// if the initial URL parsing fails
      parsedUrl = new URL(`https://${value}`);
    } catch {
      return null; // Not a valid URL or video ID format
    }
  }

  // Normalize hostname for consistent checking
  const hostname = parsedUrl.hostname.replace(/^www\./i, "").toLowerCase();

  // Helper function to extract video ID from a path segment
  const extractFromPath = (path: string) => {
    const cleaned = path.replace(/^\/+/, ""); // Remove leading slashes
    const segment = cleaned.split("/")[0] ?? "";
    return /^[a-zA-Z0-9_-]{11}$/.test(segment) ? segment : null;
  };

  // Handle youtu.be short URLs
  if (hostname === "youtu.be") {
    return extractFromPath(parsedUrl.pathname);
  }

  // Handle youtube.com and youtube-nocookie.com domains
  if (
    hostname === "youtube.com" ||
    hostname === "youtube-nocookie.com" ||
    hostname.endsWith(".youtube.com")
  ) {
    const params = parsedUrl.searchParams;
    // Check for 'v' or 'vi' query parameters
    const paramId = params.get("v") ?? params.get("vi");
    if (paramId && /^[a-zA-Z0-9_-]{11}$/.test(paramId)) {
      return paramId;
    }

    // Check for video ID in path segments (e.g., /embed/, /v/, /shorts/, /live/)
    const segments = parsedUrl.pathname.replace(/^\/+/, "").split("/");
    if (segments.length >= 2) {
      const [first, second] = segments;
      if (
        second &&
        ["embed", "v", "shorts", "live"].includes(first) &&
        /^[a-zA-Z0-9_-]{11}$/.test(second)
      ) {
        return second;
      }
    }
  }

  return null; // No valid YouTube video ID found
}
