import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AboutModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type Status = "idle" | "loading" | "error";

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [status, setStatus] = React.useState<Status>("idle");
  const [appVersion, setAppVersion] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isActive = true;
    setStatus("loading");
    setAppVersion(null);

    window.appInfo
      .get()
      .then(({ version }) => {
        if (!isActive) {
          return;
        }
        setAppVersion(version);
        setStatus("idle");
      })
      .catch(() => {
        if (!isActive) {
          return;
        }
        setStatus("error");
      });

    return () => {
      isActive = false;
    };
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("appName")}</DialogTitle>
          <DialogDescription>
            {t("menuBar.aboutDescription", { appName: t("appName") })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {status === "error" ? (
            <p className="text-sm text-destructive">
              {t("menuBar.versionError")}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {status === "loading" || appVersion === null
                ? t("menuBar.versionLoading")
                : t("menuBar.versionLabel", { version: appVersion })}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t("menuBar.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
