import React, {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { extractYouTubeVideoId } from "../utils/youtube";

/**
 * Props for the YouTubeEmbedDialog component.
 */
export type YouTubeEmbedDialogProps = {
  /** Whether the dialog is currently open. */
  open: boolean;
  /** Callback fired when the open state of the dialog changes. */
  onOpenChange: (open: boolean) => void;
  /** Callback fired when a valid YouTube video ID and URL are submitted. */
  onSubmit: (videoId: string, url: string) => void;
};

/**
 * A dialog component for embedding YouTube videos into the canvas.
 * Users can paste a YouTube link or video ID, which is then validated and submitted.
 */
const YouTubeEmbedDialog: React.FC<YouTubeEmbedDialogProps> = ({
  open,
  onOpenChange,
  onSubmit,
}) => {
  const [url, setUrl] = useState(""); // State to store the YouTube URL input by the user
  const [error, setError] = useState<string | null>(null); // State to store any validation error messages

  useEffect(() => {
    if (!open) {
      setUrl("");
      setError(null);
    } // Reset URL and error when the dialog closes
  }, [open]);

  /**
   * Handles changes to the dialog's open state, propagating it to the parent component.
   * @param nextOpen - The new open state of the dialog.
   */
  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  /**
   * Handles changes to the YouTube URL input field.
   * Clears any previous error message when the URL changes.
   * @param event - The change event from the input field.
   */
  const handleUrlChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setUrl(event.target.value);
      if (error) {
        setError(null);
      }
    },
    [error],
  );

  /**
   * Handles the form submission. Extracts the YouTube video ID and calls the onSubmit prop.
   * Displays an error if the URL is invalid.
   * @param event - The form submission event.
   */
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedUrl = url.trim();
      const videoId = extractYouTubeVideoId(trimmedUrl);
      if (!videoId) {
        setError("Enter a valid YouTube link or video ID.");
        return;
      }

      onSubmit(videoId, trimmedUrl);
    },
    [onSubmit, url],
  );

  /**
   * Handles the cancel action, closing the dialog without submitting.
   */
  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Embed YouTube video</DialogTitle>
          <DialogDescription>
            Paste a YouTube link to add the video to the canvas.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="youtube-url">YouTube link</Label>
            <Input
              id="youtube-url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={handleUrlChange}
              autoFocus
            />
            {error ? (
              <p className="text-destructive text-sm">{error}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit">Embed video</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default YouTubeEmbedDialog;
