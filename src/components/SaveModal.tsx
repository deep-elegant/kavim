import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

interface SaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  saveFileName: string;
  setSaveFileName: (value: string) => void;
  saveFolder: string;
  setSaveFolder: (value: string) => void;
  handleFolderBrowse: () => void;
  folderPickerMessage: string;
  handleSaveConfirmation: () => void;
}

export const SaveModal: React.FC<SaveModalProps> = ({
  isOpen,
  onClose,
  saveFileName,
  setSaveFileName,
  saveFolder,
  setSaveFolder,
  handleFolderBrowse,
  folderPickerMessage,
  handleSaveConfirmation,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save your project</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <label className="flex flex-col gap-1 text-sm">
            File name
            <input
              value={saveFileName}
              onChange={(event) => setSaveFileName(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Enter a file name"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Folder
            <div className="flex items-center gap-2">
              <input
                value={saveFolder}
                onChange={(event) => setSaveFolder(event.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Choose where to save"
              />
              <Button type="button" variant="outline" onClick={handleFolderBrowse}>
                Browse
              </Button>
            </div>
          </label>
          {folderPickerMessage ? (
            <p className="text-sm text-muted-foreground">{folderPickerMessage}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Projects are saved as <code>.pak</code> archives inside your Documents folder unless an absolute path is provided.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSaveConfirmation}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
